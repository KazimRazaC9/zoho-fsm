/**
 * Photos are compressed on the server when they are uploaded: shrunk, turned upright, stripped of camera
 * data, saved as JPEG, and given a thumbnail. Runs against the seeded dev database (Demo company) and
 * removes what it creates.
 */
import { randomBytes } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TINY_PNG } from "../helpers/images";
import type { CurrentUser } from "@/lib/auth";
import { createDb, prismaBase, tenantContext, type AppDb } from "@/lib/db";
import { BadRequestError } from "@/lib/errors";
import { PHOTO_MAX_EDGE, THUMB_EDGE } from "@/lib/photo";
import { workOrdersService } from "@/modules/work-orders";

const owner = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
const stamp = Date.now().toString(36);

let db: AppDb;
let dispatcher: CurrentUser;
let woId: string;
let customerId: string;
let addressId: string;
const attachmentIds: string[] = [];

const read = (key: string) => readFile(path.resolve(process.env.UPLOAD_DIR ?? "./uploads", key));

/** A large "camera" picture: a smooth gradient with some noise, saved as a high-quality JPEG. */
async function bigPhoto(width = 4000, height = 3000) {
  const raw = Buffer.alloc(width * height * 3);
  const noise = randomBytes(4096);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const n = noise[(x + y * 7) % 4096] % 24;
      raw[i] = ((x / width) * 255 + n) % 256;
      raw[i + 1] = ((y / height) * 255 + n) % 256;
      raw[i + 2] = 128 + n;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function upload(
  bytes: Buffer,
  name: string,
  type: string,
  opts?: Parameters<typeof workOrdersService.addAttachment>[4],
) {
  const a = await workOrdersService.addAttachment(
    db,
    dispatcher,
    woId,
    new File([new Uint8Array(bytes)], name, { type }),
    opts,
  );
  attachmentIds.push(a.id);
  const { meta } = await workOrdersService.readAttachment(db, a.id);
  return { id: a.id, fileName: a.fileName, meta };
}

beforeAll(async () => {
  const d = await owner.user.findFirstOrThrow({ where: { email: "dispatcher@demo.local" } });
  dispatcher = {
    id: d.id,
    role: "DISPATCHER",
    customRoleId: null,
    customRoleName: null,
    permissions: [],
    companyId: d.companyId,
    fullName: d.fullName,
    email: d.email,
    via: "session",
  } as CurrentUser;
  db = createDb(tenantContext(d.companyId!, d.id));
  const site = await owner.serviceAddress.findFirstOrThrow({
    where: { companyId: d.companyId!, deletedAt: null, customer: { deletedAt: null } },
  });
  customerId = site.customerId;
  addressId = site.id;
  const wo = await workOrdersService.create(db, dispatcher, {
    customerId,
    addressId,
    assetId: "",
    title: `P10 photos ${stamp}`,
    description: "",
    priority: "LOW",
    dueDate: "",
    checklistTemplateId: "",
  });
  woId = wo.id;
}, 60_000);

afterAll(async () => {
  const rows = await owner.attachment.findMany({
    where: { entityId: woId },
    select: { storageKey: true, thumbKey: true },
  });
  for (const r of rows)
    for (const key of [r.storageKey, r.thumbKey]) {
      if (key) await rm(path.resolve(process.env.UPLOAD_DIR ?? "./uploads", key), { force: true });
    }
  await owner.auditLog.deleteMany({ where: { entityId: { in: [woId, ...attachmentIds] } } });
  await owner.attachment.deleteMany({ where: { entityId: woId } });
  await owner.workOrderStatusChange.deleteMany({ where: { workOrderId: woId } });
  await owner.workOrder.deleteMany({ where: { id: woId } });
  await owner.$disconnect();
  await prismaBase.$disconnect();
});

describe("server-side photo compression", () => {
  it("shrinks a big camera photo, saves it as JPEG and makes a thumbnail", async () => {
    const original = await bigPhoto();
    expect(original.length).toBeGreaterThan(3_000_000); // a realistic phone-sized picture
    const up = await upload(original, "IMG_0001.HEIC.jpeg", "image/jpeg", { phase: "BEFORE", slot: "FRONT_VIEW" });

    expect(up.meta.contentType).toBe("image/jpeg");
    expect(up.fileName).toBe("IMG_0001.HEIC.jpeg");
    expect(up.meta.sizeBytes).toBeLessThan(original.length / 3);

    const main = await sharp(await read(up.meta.storageKey)).metadata();
    expect(Math.max(main.width!, main.height!)).toBe(PHOTO_MAX_EDGE);
    expect(main.format).toBe("jpeg");

    expect(up.meta.thumbKey).toBeTruthy();
    const thumbBytes = await read(up.meta.thumbKey!);
    const thumb = await sharp(thumbBytes).metadata();
    expect(Math.max(thumb.width!, thumb.height!)).toBe(THUMB_EDGE);
    expect(thumbBytes.length).toBeLessThan(up.meta.sizeBytes!);
  }, 60_000);

  it("turns a sideways photo upright and drops the camera's hidden data", async () => {
    // 400x200 flagged "rotate 90 degrees", with a GPS-style tag in its metadata.
    const sideways = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#3366cc" } })
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "camera-data" } } })
      .toBuffer();
    const up = await upload(sideways, "side.jpg", "image/jpeg", { phase: "BEFORE", slot: "CABIN_VIEW" });
    const meta = await sharp(await read(up.meta.storageKey)).metadata();
    expect([meta.width, meta.height]).toEqual([200, 400]); // now portrait, as it looked
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("serves the small thumbnail when asked, and the full photo otherwise", async () => {
    const up = await upload(await bigPhoto(2400, 1800), "wide.png", "image/png");
    expect(up.fileName).toBe("wide.jpg"); // the name follows the saved format
    const thumb = await workOrdersService.readAttachment(db, up.id, true);
    const full = await workOrdersService.readAttachment(db, up.id, false);
    expect(thumb.isThumb).toBe(true);
    expect(full.isThumb).toBe(false);
    expect(thumb.data.length).toBeLessThan(full.data.length);
  }, 60_000);

  it("refuses a file that is not a real picture", async () => {
    await expect(upload(randomBytes(500), "fake.jpg", "image/jpeg")).rejects.toBeInstanceOf(BadRequestError);
    await expect(upload(Buffer.from("<svg onload=alert(1)>"), "x.png", "image/png")).rejects.toBeInstanceOf(
      BadRequestError,
    );
    // A perfectly valid SVG (or GIF) pretending to be a PNG is refused too.
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );
    await expect(upload(svg, "valid.png", "image/png")).rejects.toBeInstanceOf(BadRequestError);
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#f00" } })
      .gif()
      .toBuffer();
    await expect(upload(gif, "anim.png", "image/png")).rejects.toBeInstanceOf(BadRequestError);
  });

  it("keeps a signature exactly as drawn (no compression, no thumbnail)", async () => {
    const up = await upload(TINY_PNG, "signature.png", "image/png", { kind: "SIGNATURE" });
    expect(up.meta.contentType).toBe("image/png");
    expect(up.meta.thumbKey).toBeNull();
    expect((await read(up.meta.storageKey)).equals(TINY_PNG)).toBe(true);
  });

  it("keeps a HEIC photo as sent, because the server cannot read that format", async () => {
    const heic = randomBytes(600);
    const up = await upload(heic, "IMG_9.heic", "image/heic");
    expect(up.meta.contentType).toBe("image/heic");
    expect(up.meta.thumbKey).toBeNull();
    expect((await read(up.meta.storageKey)).equals(heic)).toBe(true);
  });

  it("leaves documents and other files untouched", async () => {
    const text = Buffer.from("job sheet");
    const up = await upload(text, "sheet.txt", "text/plain");
    expect(up.meta.contentType).toBe("text/plain");
    expect(up.meta.thumbKey).toBeNull();
    expect((await read(up.meta.storageKey)).equals(text)).toBe(true);
  });
});
