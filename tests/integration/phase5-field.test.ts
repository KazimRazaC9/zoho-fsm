/**
 * Phase 5 acceptance: "a technician sees only their jobs, checks in, ticks the checklist, adds
 * photos and a signature, and completes the job; the office sees where they are".
 * Runs against the seeded dev database (Demo company) and removes what it creates.
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth";
import { createDb, prismaBase, tenantContext, type AppDb } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { fieldService } from "@/modules/field";
import { schedulingService } from "@/modules/scheduling";
import { workOrdersService } from "@/modules/work-orders";
import { TINY_PNG } from "../helpers/images";

const owner = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
const stamp = Date.now().toString(36);
const DAY = "2032-05-11";

let dispatcher: CurrentUser;
let techA: CurrentUser;
let techB: CurrentUser;
let db: AppDb;
let dbA: AppDb;
let dbB: AppDb;
let companyId: string;
let customerId: string;
let partId: string;
let templateId: string;
const woIds: string[] = [];
const storageKeys: string[] = [];
const locationIds: string[] = [];
let companyRequiresSignature = false;

const asUser = (u: { id: string; role: string; companyId: string | null; fullName: string; email: string }) =>
  ({
    id: u.id,
    role: u.role,
    companyId: u.companyId,
    fullName: u.fullName,
    email: u.email,
    via: "session",
  }) as CurrentUser;

beforeAll(async () => {
  const d = await owner.user.findFirstOrThrow({ where: { email: "dispatcher@demo.local" } });
  companyId = d.companyId!;
  dispatcher = asUser(d);
  db = createDb(tenantContext(companyId, d.id));
  const a = await owner.user.findFirstOrThrow({ where: { email: "tech1@demo.local" } });
  const b = await owner.user.findFirstOrThrow({ where: { email: "tech2@demo.local" } });
  techA = asUser(a);
  techB = asUser(b);
  dbA = createDb(tenantContext(companyId, a.id));
  dbB = createDb(tenantContext(companyId, b.id));
  customerId = (await owner.customer.findFirstOrThrow({ where: { companyId, deletedAt: null } })).id;
  const company = await owner.company.findFirstOrThrow({ where: { id: companyId } });
  companyRequiresSignature = company.requireSignatureOnComplete;
  const part = await owner.serviceItem.findFirst({
    where: { companyId, type: "PART", isActive: true, deletedAt: null },
  });
  partId = part!.id;
  const t = await owner.checklistTemplate.create({
    data: {
      companyId,
      name: `P5 ${stamp}`,
      items: {
        create: [
          { companyId, text: "Mount", sortOrder: 1 },
          { companyId, text: "Test", sortOrder: 2 },
        ],
      },
    },
  });
  templateId = t.id;
});

afterAll(async () => {
  const where = { workOrderId: { in: woIds } };
  const appts = await owner.appointment.findMany({ where, select: { id: true } });
  const attachments = await owner.attachment.findMany({ where: { entityId: { in: woIds } }, select: { id: true } });
  await owner.auditLog.deleteMany({
    where: { entityId: { in: [...woIds, ...attachments.map((x) => x.id), ...locationIds, templateId] } },
  });
  await owner.timeSheet.deleteMany({ where: { appointmentId: { in: appts.map((x) => x.id) } } });
  await owner.attachment.deleteMany({ where: { entityId: { in: woIds } } });
  await owner.appointment.deleteMany({ where });
  await owner.workOrderStatusChange.deleteMany({ where });
  await owner.workOrderChecklistItem.deleteMany({ where });
  await owner.workOrderLine.deleteMany({ where });
  await owner.workOrderNote.deleteMany({ where });
  await owner.workOrder.deleteMany({ where: { id: { in: woIds } } });
  await owner.technicianLocation.deleteMany({ where: { id: { in: locationIds } } });
  await owner.checklistTemplateItem.deleteMany({ where: { templateId } });
  await owner.checklistTemplate.deleteMany({ where: { id: templateId } });
  for (const k of storageKeys) await rm(path.resolve(process.env.UPLOAD_DIR ?? "./uploads", k), { force: true });
  await owner.$disconnect();
  await prismaBase.$disconnect();
});

describe("Phase 5 — technician field app", () => {
  it("a technician sees only jobs assigned to them", async () => {
    const wo = await workOrdersService.create(db, dispatcher, {
      customerId,
      addressId: "",
      assetId: "",
      title: `P5 job ${stamp}`,
      description: "",
      priority: "MEDIUM",
      dueDate: "",
      checklistTemplateId: templateId,
    });
    woIds.push(wo.id);
    await schedulingService.schedule(db, dispatcher, wo.id, {
      technicianId: techA.id,
      start: `${DAY}T09:00`,
      durationMin: 60,
    });

    const mine = await fieldService.myJobs(dbA, techA);
    expect(mine.jobs.map((j) => j.workOrderId)).toContain(wo.id);
    expect((await fieldService.myJobs(dbB, techB)).jobs.map((j) => j.workOrderId)).not.toContain(wo.id);

    await expect(fieldService.job(dbB, techB, wo.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(fieldService.transition(dbB, techB, wo.id, { action: "start" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(fieldService.addNote(dbB, techB, wo.id, "sneaky")).rejects.toBeInstanceOf(NotFoundError);

    const detail = await fieldService.job(dbA, techA, wo.id);
    expect(detail.actions).toEqual(["on-my-way", "start"]);
    expect(detail.checklist.map((c) => c.text)).toEqual(["Mount", "Test"]);
  });

  it("start checks in (timesheet), checklist and parts work, completion is guarded", async () => {
    const id = woIds[0];
    await fieldService.transition(dbA, techA, id, { action: "on-my-way" });
    expect((await workOrdersService.get(db, dispatcher, id)).status).toBe("DISPATCHED");

    const started = await fieldService.transition(dbA, techA, id, {
      action: "start",
      location: { latitude: 24.86, longitude: 67.01, accuracy: 12 },
    });
    expect(started.status).toBe("IN_PROGRESS");
    expect(started.checkedInAt).not.toBeNull();
    expect(started.actions).toEqual(["complete", "hold"]);
    const sheets = await owner.timeSheet.findMany({
      where: { appointment: { workOrderId: id } },
    });
    expect(sheets).toHaveLength(1);
    expect(Number(sheets[0].checkInLat)).toBeCloseTo(24.86, 3);

    // Parts: price comes from the catalog; the technician view shows no prices.
    await fieldService.addPart(dbA, techA, id, { serviceItemId: partId, qty: 2 });
    const withPart = await fieldService.job(dbA, techA, id);
    expect(withPart.parts).toHaveLength(1);
    expect(withPart.parts[0]).not.toHaveProperty("unitPrice");
    const line = await owner.workOrderLine.findFirstOrThrow({ where: { workOrderId: id } });
    const item = await owner.serviceItem.findFirstOrThrow({ where: { id: partId } });
    expect(Number(line.unitPrice)).toBe(Number(item.unitPrice));

    await expect(fieldService.transition(dbA, techA, id, { action: "complete" })).rejects.toThrow(
      /Finish the checklist/,
    );
    for (const c of withPart.checklist) await fieldService.setChecklist(dbA, techA, id, c.id, true);
    await fieldService.addNote(dbA, techA, id, "Replaced the unit");

    if (companyRequiresSignature) {
      await expect(fieldService.transition(dbA, techA, id, { action: "complete" })).rejects.toThrow(/signature/);
    }
  });

  it("photos and signature upload, are visible to the technician and satisfy the signature rule", async () => {
    const id = woIds[0];
    const png = new File([TINY_PNG], "sig.png", { type: "image/png" });
    await fieldService.uploadFile(dbA, techA, id, png, { signature: true });
    await fieldService.uploadFile(dbA, techA, id, new File([TINY_PNG], "p.png", { type: "image/png" }));
    const atts = await owner.attachment.findMany({ where: { entityId: id } });
    storageKeys.push(...atts.map((a) => a.storageKey));
    const detail = await fieldService.job(dbA, techA, id);
    expect(detail.hasSignature).toBe(true);
    expect(detail.photos.map((p) => p.kind).sort()).toEqual(["PHOTO", "SIGNATURE"]);
    expect(detail.notes.map((n) => n.text)).toContain("Replaced the unit");
  });

  it("hold needs a reason and stops the clock; resume starts a new check-in; complete closes it", async () => {
    const id = woIds[0];
    await expect(fieldService.transition(dbA, techA, id, { action: "hold" })).rejects.toThrow(/reason/);
    const held = await fieldService.transition(dbA, techA, id, { action: "hold", reason: "Waiting for part" });
    expect(held.status).toBe("ON_HOLD");
    expect(held.checkedInAt).toBeNull();
    expect(held.actions).toEqual(["resume"]);

    const resumed = await fieldService.transition(dbA, techA, id, { action: "resume" });
    expect(resumed.status).toBe("IN_PROGRESS");

    const done = await fieldService.transition(dbA, techA, id, {
      action: "complete",
      location: { latitude: 24.87, longitude: 67.02 },
    });
    expect(done.status).toBe("COMPLETED");
    expect(done.closed).toBe(true);
    expect(done.actions).toEqual([]);
    const sheets = await owner.timeSheet.findMany({
      where: { appointment: { workOrderId: id } },
      orderBy: { checkInAt: "asc" },
    });
    expect(sheets).toHaveLength(2);
    expect(sheets.every((s) => s.checkOutAt && s.durationMinutes !== null)).toBe(true);

    // A finished job is read-only for the technician too.
    await expect(fieldService.addNote(dbA, techA, id, "late")).resolves.toBeUndefined();
    await expect(fieldService.addPart(dbA, techA, id, { serviceItemId: partId, qty: 1 })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("locations feed the live map, newest per technician", async () => {
    await fieldService.recordLocation(dbA, techA, { latitude: 24.8, longitude: 67.0, accuracy: 20 });
    await fieldService.recordLocation(dbA, techA, { latitude: 24.9, longitude: 67.1, speed: 8.5, heading: 90 });
    const rows = await owner.technicianLocation.findMany({
      where: { technicianId: techA.id },
      orderBy: { createdAt: "desc" },
      take: 2,
    });
    locationIds.push(...rows.map((r) => r.id));

    const live = await fieldService.live(db);
    const a = live.find((t) => t.id === techA.id)!;
    expect(a.location?.latitude).toBeCloseTo(24.9, 3);
    expect(live.find((t) => t.id === techB.id)?.location ?? null).toBeNull();
  });
});
