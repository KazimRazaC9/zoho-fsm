/**
 * Before/after proof and extra issues found on site.
 *  - The reported problem holds up to 4 photos and 1 video BEFORE and the same AFTER.
 *  - Each extra issue has its own before/after proof with the same allowance.
 *  - A technician can only add proof to their own job, and remove only their own files.
 * Runs against the seeded dev database (Demo company) and removes what it creates.
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth";
import { createDb, prismaBase, tenantContext, type AppDb } from "@/lib/db";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/errors";
import { fieldService } from "@/modules/field";
import { missingSlotPhotos, workOrdersService } from "@/modules/work-orders";
import { TINY_PNG } from "../helpers/images";

const owner = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
const stamp = Date.now().toString(36);

let companyId: string;
let customerId: string;
let dispatcher: CurrentUser;
let techA: CurrentUser;
let techB: CurrentUser;
let db: AppDb;
let dbA: AppDb;
let dbB: AppDb;
const woIds: string[] = [];

const asUser = (u: { id: string; role: string; companyId: string | null; fullName: string; email: string }) =>
  ({
    id: u.id,
    role: u.role,
    customRoleId: null,
    customRoleName: null,
    permissions: [],
    companyId: u.companyId,
    fullName: u.fullName,
    email: u.email,
    via: "session",
  }) as CurrentUser;

const photo = (n: number) => new File([TINY_PNG], `p${n}.png`, { type: "image/png" });
const video = (n: number) =>
  new File([Buffer.from("00000018667479706d703432", "hex")], `v${n}.mp4`, { type: "video/mp4" });
const pdf = () => new File([Buffer.from("25504446", "hex")], "sheet.pdf", { type: "application/pdf" });

async function newWorkOrder(title: string) {
  const site = await owner.serviceAddress.findFirstOrThrow({ where: { companyId, customerId, deletedAt: null } });
  const wo = await workOrdersService.create(db, dispatcher, {
    customerId,
    addressId: site.id,
    assetId: "",
    title: `${title} ${stamp}`,
    description: "",
    priority: "MEDIUM",
    dueDate: "",
    checklistTemplateId: "",
  });
  woIds.push(wo.id);
  return wo.id;
}

beforeAll(async () => {
  const d = await owner.user.findFirstOrThrow({ where: { email: "dispatcher@demo.local" } });
  const a = await owner.user.findFirstOrThrow({ where: { email: "tech1@demo.local" } });
  const b = await owner.user.findFirstOrThrow({ where: { email: "tech2@demo.local" } });
  companyId = d.companyId!;
  dispatcher = asUser(d);
  techA = asUser(a);
  techB = asUser(b);
  db = createDb(tenantContext(companyId, d.id));
  dbA = createDb(tenantContext(companyId, a.id));
  dbB = createDb(tenantContext(companyId, b.id));
  customerId = (
    await owner.customer.findFirstOrThrow({
      where: { companyId, deletedAt: null, addresses: { some: { deletedAt: null } } },
    })
  ).id;
});

afterAll(async () => {
  const files = await owner.attachment.findMany({ where: { entityId: { in: woIds } }, select: { storageKey: true } });
  for (const f of files) await rm(path.resolve(process.env.UPLOAD_DIR ?? "./uploads", f.storageKey), { force: true });
  await owner.auditLog.deleteMany({ where: { entityId: { in: woIds } } });
  await owner.attachment.deleteMany({ where: { entityId: { in: woIds } } });
  await owner.workOrderIssue.deleteMany({ where: { workOrderId: { in: woIds } } });
  await owner.appointment.deleteMany({ where: { workOrderId: { in: woIds } } });
  await owner.workOrderStatusChange.deleteMany({ where: { workOrderId: { in: woIds } } });
  await owner.workOrderChecklistItem.deleteMany({ where: { workOrderId: { in: woIds } } });
  await owner.workOrderLine.deleteMany({ where: { workOrderId: { in: woIds } } });
  await owner.workOrder.deleteMany({ where: { id: { in: woIds } } });
  await owner.$disconnect();
  await prismaBase.$disconnect();
});

describe("reported problem: labeled photos, before and after", () => {
  let id: string;
  const labels = ["FRONT_VIEW", "DEVICE_INSTALLED", "CABIN_VIEW", "ODOMETER", "BACK_CAMERA"] as const;

  it("takes one photo per label before and after, plus one video each", async () => {
    id = await newWorkOrder("P8 proof");
    for (const slot of labels) {
      await workOrdersService.addAttachment(db, dispatcher, id, photo(1), { phase: "BEFORE", slot });
      await workOrdersService.addAttachment(db, dispatcher, id, photo(2), { phase: "AFTER", slot });
    }
    await workOrdersService.addAttachment(db, dispatcher, id, video(1), { phase: "BEFORE" });
    await workOrdersService.addAttachment(db, dispatcher, id, video(1), { phase: "AFTER" });

    const wo = await workOrdersService.get(db, dispatcher, id);
    expect(wo.evidence.before.filter((m) => m.kind === "PHOTO").map((m) => m.slot)).toEqual([...labels]);
    expect(wo.evidence.after).toHaveLength(6);
    expect(wo.evidence.before.filter((m) => m.kind === "VIDEO")).toHaveLength(1);
    // Proof is kept apart from ordinary files.
    expect(wo.attachments).toHaveLength(0);
    expect(missingSlotPhotos(wo.evidence, false)).toEqual({ before: 0, after: 0 });
    expect(missingSlotPhotos(wo.evidence, true)).toEqual({ before: 2, after: 2 });
  });

  it("taking a labeled photo again replaces the old one", async () => {
    const before = await workOrdersService.get(db, dispatcher, id);
    const old = before.evidence.before.find((m) => m.slot === "ODOMETER")!;
    await workOrdersService.addAttachment(db, dispatcher, id, photo(9), { phase: "BEFORE", slot: "ODOMETER" });
    const after = await workOrdersService.get(db, dispatcher, id);
    const odo = after.evidence.before.filter((m) => m.slot === "ODOMETER");
    expect(odo).toHaveLength(1);
    expect(odo[0].id).not.toBe(old.id);
    expect(after.evidence.before.filter((m) => m.kind === "PHOTO")).toHaveLength(5);
  });

  it("refuses an unlabeled photo, a second video, and a video in a labeled slot", async () => {
    await expect(workOrdersService.addAttachment(db, dispatcher, id, photo(5), { phase: "BEFORE" })).rejects.toThrow(
      /Choose which photo this is/,
    );
    await expect(workOrdersService.addAttachment(db, dispatcher, id, video(2), { phase: "AFTER" })).rejects.toThrow(
      "The after section already has 1 video. Remove one to add another.",
    );
    await expect(
      workOrdersService.addAttachment(db, dispatcher, id, video(3), { phase: "BEFORE", slot: "FRONT_VIEW" }),
    ).rejects.toBeInstanceOf(BadRequestError);
    // A label needs Before or After.
    await expect(
      workOrdersService.addAttachment(db, dispatcher, id, photo(6), { slot: "FRONT_VIEW" }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("the temp probe and temp sensor labels need the temperature switch", async () => {
    await expect(
      workOrdersService.addAttachment(db, dispatcher, id, photo(1), { phase: "BEFORE", slot: "TEMP_PROBE" }),
    ).rejects.toThrow(/Temperature sensor installed/);

    await workOrdersService.setTempSensor(db, id, true);
    expect((await workOrdersService.get(db, dispatcher, id)).hasTempSensor).toBe(true);
    await workOrdersService.addAttachment(db, dispatcher, id, photo(1), { phase: "BEFORE", slot: "TEMP_PROBE" });
    await workOrdersService.addAttachment(db, dispatcher, id, photo(2), { phase: "AFTER", slot: "TEMP_SENSOR" });

    // It cannot be switched off while those photos exist.
    await expect(workOrdersService.setTempSensor(db, id, false)).rejects.toThrow(/Remove the temp probe/);
    const wo = await workOrdersService.get(db, dispatcher, id);
    expect(missingSlotPhotos(wo.evidence, true)).toEqual({ before: 1, after: 1 });
    for (const m of [...wo.evidence.before, ...wo.evidence.after].filter((x) => x.slot?.startsWith("TEMP_")))
      await workOrdersService.removeAttachment(db, id, m.id);
    await workOrdersService.setTempSensor(db, id, false);
  });

  it("accepts only photos and videos as proof", async () => {
    await expect(
      workOrdersService.addAttachment(db, dispatcher, id, pdf(), { phase: "BEFORE" }),
    ).rejects.toBeInstanceOf(BadRequestError);
    // An ordinary file still works.
    await workOrdersService.addAttachment(db, dispatcher, id, pdf());
    expect((await workOrdersService.get(db, dispatcher, id)).attachments).toHaveLength(1);
  });
});

describe("other photos", () => {
  it("holds 15 photos in total, then asks to remove one", async () => {
    const id = await newWorkOrder("P8 other photos");
    for (let n = 1; n <= 15; n++) await workOrdersService.addAttachment(db, dispatcher, id, photo(n));
    await expect(workOrdersService.addAttachment(db, dispatcher, id, photo(16))).rejects.toThrow(
      "This work order already has 15 other photos. Remove one to add another.",
    );
    // Labeled photos and documents do not use up the 15.
    await workOrdersService.addAttachment(db, dispatcher, id, photo(17), { phase: "BEFORE", slot: "FRONT_VIEW" });
    await workOrdersService.addAttachment(db, dispatcher, id, pdf());

    const wo = await workOrdersService.get(db, dispatcher, id);
    expect(wo.attachments.filter((a) => a.kind === "PHOTO")).toHaveLength(15);
    await workOrdersService.removeAttachment(db, id, wo.attachments.find((a) => a.kind === "PHOTO")!.id);
    await workOrdersService.addAttachment(db, dispatcher, id, photo(18));
  });
});

describe("other issues found on site", () => {
  let id: string;
  let issueId: string;

  it("records an issue with its own before/after proof, separate from the reported problem", async () => {
    id = await newWorkOrder("P8 issues");
    // The reported problem's slot is full; an issue has its own.
    await workOrdersService.addAttachment(db, dispatcher, id, photo(1), { phase: "BEFORE", slot: "FRONT_VIEW" });

    const issue = await workOrdersService.addIssue(db, dispatcher, id, {
      title: "Loose or damaged wiring",
      details: "Harness chafed near the door",
      status: "FOUND",
    });
    issueId = issue.id;
    for (let n = 1; n <= 4; n++)
      await workOrdersService.addAttachment(db, dispatcher, id, photo(n), { phase: "BEFORE", issueId });
    await workOrdersService.addAttachment(db, dispatcher, id, video(1), { phase: "AFTER", issueId });
    await expect(
      workOrdersService.addAttachment(db, dispatcher, id, photo(9), { phase: "BEFORE", issueId }),
    ).rejects.toBeInstanceOf(ConflictError);

    const wo = await workOrdersService.get(db, dispatcher, id);
    expect(wo.evidence.before).toHaveLength(1);
    expect(wo.issues).toHaveLength(1);
    expect(wo.issues[0]).toMatchObject({
      title: "Loose or damaged wiring",
      status: "FOUND",
      details: "Harness chafed near the door",
    });
    expect(wo.issues[0].evidence.before).toHaveLength(4);
    expect(wo.issues[0].evidence.after.map((m) => m.kind)).toEqual(["VIDEO"]);
    expect(wo.attachments).toHaveLength(0);
  });

  it("needs a phase, and the issue must belong to this work order", async () => {
    await expect(workOrdersService.addAttachment(db, dispatcher, id, photo(1), { issueId })).rejects.toBeInstanceOf(
      BadRequestError,
    );
    const other = await newWorkOrder("P8 other");
    await expect(
      workOrdersService.addAttachment(db, dispatcher, other, photo(1), { phase: "BEFORE", issueId }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updates the status, and removing the issue removes its proof", async () => {
    await workOrdersService.updateIssue(db, id, issueId, {
      title: "Loose or damaged wiring",
      details: "Re-routed and taped",
      status: "FIXED",
    });
    expect((await workOrdersService.get(db, dispatcher, id)).issues[0].status).toBe("FIXED");

    await workOrdersService.removeIssue(db, id, issueId);
    const wo = await workOrdersService.get(db, dispatcher, id);
    expect(wo.issues).toHaveLength(0);
    expect(await db.attachment.count({ where: { entityId: id, issueId } })).toBe(0);
  });

  it("is locked once the work order is completed", async () => {
    const locked = await newWorkOrder("P8 locked");
    for (const status of ["SCHEDULED", "DISPATCHED", "IN_PROGRESS", "COMPLETED"] as const)
      await workOrdersService.changeStatus(db, dispatcher, locked, { status, reason: "" });
    await expect(
      workOrdersService.addAttachment(db, dispatcher, locked, photo(1), { phase: "AFTER" }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      workOrdersService.addIssue(db, dispatcher, locked, { title: "Late find", details: "", status: "FOUND" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("technician app", () => {
  it("adds proof and issues only on their own job, and removes only their own files", async () => {
    const id = await newWorkOrder("P8 field");
    const start = new Date(Date.now() + 86_400_000 * 30);
    await owner.appointment.create({
      data: {
        companyId,
        workOrderId: id,
        technicianId: techA.id,
        scheduledStart: start,
        scheduledEnd: new Date(start.getTime() + 3_600_000),
        status: "SCHEDULED",
      },
    });

    await fieldService.uploadFile(dbA, techA, id, photo(1), { phase: "BEFORE", slot: "FRONT_VIEW" });
    const issue = await fieldService.addIssue(dbA, techA, id, {
      title: "Camera lens dirty or misaligned",
      details: "",
      status: "FOUND",
    });
    await fieldService.uploadFile(dbA, techA, id, photo(2), { phase: "AFTER", issueId: issue.id });

    const job = await fieldService.job(dbA, techA, id);
    expect(job.evidence.before).toHaveLength(1);
    expect(job.issues[0].evidence.after).toHaveLength(1);
    expect(job.meId).toBe(techA.id);

    // Another technician cannot touch this job at all.
    await expect(fieldService.uploadFile(dbB, techB, id, photo(3), { phase: "BEFORE" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      fieldService.addIssue(dbB, techB, id, { title: "x", details: "", status: "FOUND" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // The office adds a file; the technician cannot remove it, but can remove their own.
    const officeFile = await workOrdersService.addAttachment(db, dispatcher, id, photo(4), {
      phase: "BEFORE",
      slot: "CABIN_VIEW",
    });
    await expect(fieldService.removeFile(dbA, techA, id, officeFile.id)).rejects.toBeInstanceOf(NotFoundError);
    await fieldService.removeFile(dbA, techA, id, job.evidence.before[0].id);
    expect((await fieldService.job(dbA, techA, id)).evidence.before).toHaveLength(1);
  });
});

describe("voice notes", () => {
  const voice = (n: number, type = "audio/webm;codecs=opus") =>
    new File([Buffer.from("1a45dfa3", "hex")], `voice-${n}.weba`, { type });

  it("keeps spoken notes apart from files and photos, tolerates the codec suffix, and caps them at 10", async () => {
    const id = await newWorkOrder("P8 voice");
    for (let n = 1; n <= 10; n++) await workOrdersService.addAttachment(db, dispatcher, id, voice(n));
    const wo = await workOrdersService.get(db, dispatcher, id);
    expect(wo.voiceNotes).toHaveLength(10);
    expect(wo.attachments).toHaveLength(0);
    expect(wo.evidence.before).toHaveLength(0);
    const stored = await db.attachment.findFirst({ where: { entityId: id, kind: "AUDIO" } });
    expect(stored?.contentType).toBe("audio/webm");

    await expect(workOrdersService.addAttachment(db, dispatcher, id, voice(11))).rejects.toThrow(
      "This work order already has 10 voice notes. Remove one to add another.",
    );
    await workOrdersService.removeAttachment(db, id, wo.voiceNotes[0].id);
    await workOrdersService.addAttachment(db, dispatcher, id, voice(12, "audio/mp4"));
    expect((await workOrdersService.get(db, dispatcher, id)).voiceNotes).toHaveLength(10);
  });

  it("is not accepted as before/after proof", async () => {
    const id = await newWorkOrder("P8 voice proof");
    await expect(
      workOrdersService.addAttachment(db, dispatcher, id, voice(1), { phase: "BEFORE" }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("lets a technician add voice notes to their own job and remove only their own", async () => {
    const id = await newWorkOrder("P8 voice field");
    const start = new Date(Date.now() + 86_400_000 * 31);
    await owner.appointment.create({
      data: {
        companyId,
        workOrderId: id,
        technicianId: techA.id,
        scheduledStart: start,
        scheduledEnd: new Date(start.getTime() + 3_600_000),
        status: "SCHEDULED",
      },
    });
    await fieldService.uploadFile(dbA, techA, id, voice(1));
    await expect(fieldService.uploadFile(dbB, techB, id, voice(2))).rejects.toBeInstanceOf(NotFoundError);
    const officeNote = await workOrdersService.addAttachment(db, dispatcher, id, voice(3));

    const job = await fieldService.job(dbA, techA, id);
    expect(job.voiceNotes).toHaveLength(2);
    await expect(fieldService.removeFile(dbA, techA, id, officeNote.id)).rejects.toBeInstanceOf(NotFoundError);
    const mine = job.voiceNotes.find((v) => v.authorId === techA.id)!;
    await fieldService.removeFile(dbA, techA, id, mine.id);
    expect((await fieldService.job(dbA, techA, id)).voiceNotes).toHaveLength(1);
  });
});

describe("videos recorded in the app", () => {
  it("takes a WebM with a codec suffix, and refuses a video over the size limit", async () => {
    const id = await newWorkOrder("P8 video");
    const recorded = new File([Buffer.from("1a45dfa3", "hex")], "video-1.webm", { type: "video/webm;codecs=vp9,opus" });
    await workOrdersService.addAttachment(db, dispatcher, id, recorded, { phase: "BEFORE" });
    const wo = await workOrdersService.get(db, dispatcher, id);
    expect(wo.evidence.before[0]).toMatchObject({ kind: "VIDEO", contentType: "video/webm" });

    const big = new File([new Uint8Array(51 * 1024 * 1024)], "big.mp4", { type: "video/mp4" });
    await expect(workOrdersService.addAttachment(db, dispatcher, id, big, { phase: "AFTER" })).rejects.toThrow(
      "Videos can be at most 50 MB.",
    );
  });
});
