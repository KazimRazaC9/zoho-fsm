/**
 * Phase 3 acceptance: "a request becomes a work order with lines and a checklist; invalid status
 * moves are rejected with a clear message", plus numbering, the timeline, locking and files.
 * Runs against the seeded dev database (Demo company) and removes what it creates.
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth";
import { createDb, prismaBase, tenantContext, type AppDb } from "@/lib/db";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/errors";
import { checklistsService } from "@/modules/checklists";
import { requestsService } from "@/modules/requests";
import { workOrdersService } from "@/modules/work-orders";

const owner = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
const stamp = Date.now().toString(36);

let dispatcher: CurrentUser;
let admin: CurrentUser;
let db: AppDb;
let adminDb: AppDb;
let acmeDb: AppDb;
let customerId: string;
let addressId: string;
const requestIds: string[] = [];
const woIds: string[] = [];
const templateIds: string[] = [];
const storageKeys: string[] = [];

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
  const a = await owner.user.findFirstOrThrow({ where: { email: "admin@demo.local" } });
  dispatcher = asUser(d);
  admin = asUser(a);
  db = createDb(tenantContext(d.companyId!, d.id));
  adminDb = createDb(tenantContext(a.companyId!, a.id));
  const acme = await owner.user.findFirstOrThrow({ where: { email: "admin@acme.local" } });
  acmeDb = createDb(tenantContext(acme.companyId!, acme.id));
  const site = await owner.serviceAddress.findFirstOrThrow({
    where: { companyId: d.companyId!, deletedAt: null, customer: { deletedAt: null } },
  });
  customerId = site.customerId;
  addressId = site.id;
});

afterAll(async () => {
  const where = { workOrderId: { in: woIds } };
  const attachments = await owner.attachment.findMany({ where: { entityId: { in: woIds } }, select: { id: true } });
  await owner.auditLog.deleteMany({
    where: { entityId: { in: [...woIds, ...requestIds, ...templateIds, ...attachments.map((x) => x.id)] } },
  });
  await owner.attachment.deleteMany({ where: { entityId: { in: woIds } } });
  await owner.workOrderStatusChange.deleteMany({ where });
  await owner.workOrderChecklistItem.deleteMany({ where });
  await owner.workOrderLine.deleteMany({ where });
  await owner.workOrderNote.deleteMany({ where });
  await owner.workOrder.deleteMany({ where: { id: { in: woIds } } });
  await owner.serviceRequest.deleteMany({ where: { id: { in: requestIds } } });
  await owner.checklistTemplateItem.deleteMany({ where: { templateId: { in: templateIds } } });
  await owner.checklistTemplate.deleteMany({ where: { id: { in: templateIds } } });
  for (const k of storageKeys) await rm(path.resolve(process.env.UPLOAD_DIR ?? "./uploads", k), { force: true });
  await owner.$disconnect();
  await prismaBase.$disconnect();
});

describe("Phase 3 — request to work order", () => {
  it("a request becomes a work order with lines and a checklist", async () => {
    const template = await checklistsService.create(adminDb, admin, {
      name: `P3 Install ${stamp}`,
      items: ["Mount device", "Test video"],
      isActive: true,
    });
    templateIds.push(template.id);

    const req = await requestsService.create(db, dispatcher, {
      customerId,
      addressId,
      assetId: "",
      title: `P3 MDVR rebooting ${stamp}`,
      description: "Restarts every few minutes",
      priority: "HIGH",
      source: "PHONE",
      category: "REPAIR",
      contactName: "Fleet desk",
      contactPhone: "0300-1234567",
      contactEmail: "desk@example.com",
      preferredAt: "2030-01-14T09:30",
    });
    requestIds.push(req.id);
    expect(req).toMatchObject({ category: "REPAIR", contactName: "Fleet desk", preferredAtLocal: "2030-01-14T09:30" });
    expect(req.number).toMatch(/^SR-\d{6}$/);
    expect(req.status).toBe("NEW");

    const { id, number } = await requestsService.convert(db, dispatcher, req.id, {
      checklistTemplateId: template.id,
      dueDate: "2030-01-15T10:00",
    });
    woIds.push(id);
    expect(number).toMatch(/^WO-\d{6}$/);

    // Converting twice is refused.
    await expect(
      requestsService.convert(db, dispatcher, req.id, { checklistTemplateId: "", dueDate: "" }),
    ).rejects.toThrow(/already converted/);
    expect((await requestsService.get(db, dispatcher, req.id)).workOrder?.number).toBe(number);

    await workOrdersService.addLine(db, dispatcher, id, {
      serviceItemId: "",
      description: "Diagnostic visit",
      qty: 1,
      unitPrice: 2000,
      taxPercent: 16,
    });
    await workOrdersService.addLine(db, dispatcher, id, {
      serviceItemId: "",
      description: "Wiring harness",
      qty: 2,
      unitPrice: 1500.5,
      taxPercent: 16,
    });

    const wo = await workOrdersService.get(db, dispatcher, id);
    expect(wo.request?.id).toBe(req.id);
    expect(wo.title).toBe(req.title);
    expect(wo.priority).toBe("HIGH");
    expect(wo.address?.id).toBe(addressId);
    expect(wo.checklist.map((c) => c.text)).toEqual(["Mount device", "Test video"]);
    expect(wo.lines).toHaveLength(2);
    expect(wo.totals).toEqual({ subTotal: 5001, tax: 800.16, total: 5801.16 });
    expect(wo.timeline).toHaveLength(1);
    expect(wo.timeline[0]).toMatchObject({ fromStatus: null, toStatus: "NEW" });
  });

  it("rejects invalid status moves with a clear message", async () => {
    const id = woIds[0];
    await expect(
      workOrdersService.changeStatus(db, dispatcher, id, { status: "COMPLETED", reason: "" }),
    ).rejects.toThrow("A new work order cannot be moved to completed. Allowed: scheduled, on hold, cancelled.");
    await expect(workOrdersService.changeStatus(db, dispatcher, id, { status: "ON_HOLD", reason: "" })).rejects.toThrow(
      /reason/,
    );
  });

  it("walks the status path, blocks completion until the checklist is done, and records the timeline", async () => {
    const id = woIds[0];
    for (const status of ["SCHEDULED", "DISPATCHED", "IN_PROGRESS"] as const) {
      await workOrdersService.changeStatus(db, dispatcher, id, { status, reason: "" });
    }
    await expect(
      workOrdersService.changeStatus(db, dispatcher, id, { status: "COMPLETED", reason: "" }),
    ).rejects.toThrow("Finish the checklist first: 2 items are not done.");

    const wo = await workOrdersService.get(db, dispatcher, id);
    for (const item of wo.checklist) await workOrdersService.setChecklistItem(db, dispatcher, id, item.id, true);
    const done = await workOrdersService.changeStatus(db, dispatcher, id, { status: "COMPLETED", reason: "" });

    expect(done.status).toBe("COMPLETED");
    expect(done.completedAt).not.toBeNull();
    expect(done.checklist.every((c) => c.isDone && c.doneBy)).toBe(true);
    expect(done.timeline.map((t) => t.toStatus)).toEqual([
      "NEW",
      "SCHEDULED",
      "DISPATCHED",
      "IN_PROGRESS",
      "COMPLETED",
    ]);
  });

  it("locks a completed work order; only an Admin can reopen it", async () => {
    const id = woIds[0];
    await expect(
      workOrdersService.addLine(db, dispatcher, id, {
        serviceItemId: "",
        description: "x",
        qty: 1,
        unitPrice: 1,
        taxPercent: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      workOrdersService.changeStatus(db, dispatcher, id, { status: "IN_PROGRESS", reason: "Callback" }),
    ).rejects.toThrow(/Only an Admin/);

    const reopened = await workOrdersService.changeStatus(adminDb, admin, id, {
      status: "IN_PROGRESS",
      reason: "Callback",
    });
    expect(reopened.status).toBe("IN_PROGRESS");
    expect(reopened.completedAt).toBeNull();
    expect(reopened.timeline.at(-1)).toMatchObject({ fromStatus: "COMPLETED", reason: "Callback" });
  });

  it("stores attachments, refuses unsafe types, and hides them from other companies", async () => {
    const id = woIds[0];
    const png = new File([Buffer.from("89504e470d0a1a0a", "hex")], "../../evil name.png", { type: "image/png" });
    const a = await workOrdersService.addAttachment(db, dispatcher, id, png);
    expect(a.fileName).toBe("evil name.png");
    const { meta, data } = await workOrdersService.readAttachment(db, a.id);
    storageKeys.push(meta.storageKey);
    expect(meta.kind).toBe("PHOTO");
    expect(data.length).toBe(8);

    const html = new File(["<script>alert(1)</script>"], "x.html", { type: "text/html" });
    await expect(workOrdersService.addAttachment(db, dispatcher, id, html)).rejects.toBeInstanceOf(BadRequestError);
    await expect(workOrdersService.readAttachment(acmeDb, a.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("another company cannot see the work order or the request", async () => {
    await expect(workOrdersService.get(acmeDb, admin, woIds[0])).rejects.toBeInstanceOf(NotFoundError);
    await expect(requestsService.get(acmeDb, admin, requestIds[0])).rejects.toBeInstanceOf(NotFoundError);
  });
});
