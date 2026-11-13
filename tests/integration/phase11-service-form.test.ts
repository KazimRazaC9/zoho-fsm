/**
 * The DriveSense job form on a work order: filled by the office (and optionally by the technician),
 * editable until the work order is closed. Runs against the seeded dev database (Demo company) and
 * removes what it creates.
 */
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth";
import { createDb, prismaBase, tenantContext, type AppDb } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { fieldService } from "@/modules/field";
import { BLANK_SERVICE_FORM, workOrdersService, type ServiceFormInput } from "@/modules/work-orders";

const owner = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
const stamp = Date.now().toString(36);

let companyId: string;
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

const form = (patch: Partial<ServiceFormInput> = {}): ServiceFormInput => ({ ...BLANK_SERVICE_FORM, ...patch });

async function newWorkOrder(title: string, assignTo?: CurrentUser) {
  const site = await owner.serviceAddress.findFirstOrThrow({
    where: { companyId, deletedAt: null, customer: { deletedAt: null } },
  });
  const wo = await workOrdersService.create(db, dispatcher, {
    customerId: site.customerId,
    addressId: site.id,
    assetId: "",
    title: `${title} ${stamp}`,
    description: "",
    zohoTicket: "ZD-9001",
    priority: "LOW",
    dueDate: "",
    checklistTemplateId: "",
  });
  woIds.push(wo.id);
  if (assignTo) {
    const start = new Date(Date.now() + 86_400_000 * 40);
    await owner.appointment.create({
      data: {
        companyId,
        workOrderId: wo.id,
        technicianId: assignTo.id,
        scheduledStart: start,
        scheduledEnd: new Date(start.getTime() + 3_600_000),
        status: "SCHEDULED",
      },
    });
  }
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
});

afterAll(async () => {
  await owner.auditLog.deleteMany({ where: { entityId: { in: woIds } } });
  await owner.workOrderServiceForm.deleteMany({ where: { workOrderId: { in: woIds } } });
  await owner.appointment.deleteMany({ where: { workOrderId: { in: woIds } } });
  await owner.workOrderStatusChange.deleteMany({ where: { workOrderId: { in: woIds } } });
  await owner.workOrderChecklistItem.deleteMany({ where: { workOrderId: { in: woIds } } });
  await owner.workOrder.deleteMany({ where: { id: { in: woIds } } });
  await owner.$disconnect();
  await prismaBase.$disconnect();
});

describe("service form", () => {
  it("is empty at first and shows what the system already knows", async () => {
    const id = await newWorkOrder("P11 empty", techA);
    const wo = await workOrdersService.get(db, dispatcher, id);
    expect(wo.serviceForm).toBeNull();
    expect(wo.formContext).toMatchObject({ ticket: "ZD-9001", technicianName: techA.fullName });
    expect(wo.formContext.clientName.length).toBeGreaterThan(0);
    expect(wo.formContext.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("the office saves it, saving again updates the same form, and the lists are tidied", async () => {
    const id = await newWorkOrder("P11 office");
    await workOrdersService.saveServiceForm(
      db,
      dispatcher,
      id,
      form({
        vehicleNumber: "LES-2231",
        simNumber: "0300-111",
        driverName: "Asif",
        visitTypes: ["SERVICING", "SERVICING", "TAMPERING"],
        visitReasons: ["CAMERA_NOT_WORKING", "WIRING_ISSUE"],
        visitReasonOther: "  ",
        checks: { DEVICE_POWER: "OK", GPS_LOCATION: "NOT_OK", BACK_CAMERA: "NA" },
        firmwareNumber: "FW-1.2",
        workDone: ["WIRING_FIXED", "TEST_COMPLETED"],
        replaced: {
          SD_CARD: { replaced: "YES", oldDetails: "A1", newDetails: "B2", remarks: "corrupt card" },
          FUSE: { replaced: null, oldDetails: "", newDetails: "", remarks: "" },
        },
        finalResult: "PARTIAL",
        notResolvedReason: "GPS antenna on order",
        finalRemarks: "Return in 3 days",
        clientPersonName: "Bilal",
        clientPersonMobile: "0301-222",
      }),
    );
    const first = (await workOrdersService.get(db, dispatcher, id)).serviceForm!;
    expect(first).toMatchObject({
      vehicleNumber: "LES-2231",
      visitTypes: ["SERVICING", "TAMPERING"], // no duplicates
      visitReasonOther: "", // blank text is stored as nothing
      checks: { DEVICE_POWER: "OK", GPS_LOCATION: "NOT_OK", BACK_CAMERA: "NA" },
      finalResult: "PARTIAL",
      clientPersonName: "Bilal",
      updatedBy: dispatcher.fullName,
    });
    expect(Object.keys(first.replaced)).toEqual(["SD_CARD"]); // the untouched fuse row is dropped

    await workOrdersService.saveServiceForm(db, dispatcher, id, form({ ...first, finalResult: "RESOLVED" }));
    const second = (await workOrdersService.get(db, dispatcher, id)).serviceForm!;
    expect(second.finalResult).toBe("RESOLVED");
    expect(await owner.workOrderServiceForm.count({ where: { workOrderId: id } })).toBe(1);
  });

  it("a technician may fill it on their own job, not on another technician's", async () => {
    const id = await newWorkOrder("P11 tech", techA);
    await fieldService.saveServiceForm(dbA, techA, id, form({ vehicleNumber: "KAA-2187", visitTypes: ["REDO"] }));
    const job = await fieldService.job(dbA, techA, id);
    expect(job.serviceForm).toMatchObject({ vehicleNumber: "KAA-2187", visitTypes: ["REDO"] });
    expect(job.formContext.ticket).toBe("ZD-9001");

    await expect(fieldService.saveServiceForm(dbB, techB, id, form({ vehicleNumber: "X" }))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("the office can keep filling it while QA waits, but nobody can change it once closed", async () => {
    const id = await newWorkOrder("P11 lock", techA);
    for (const status of ["SCHEDULED", "DISPATCHED", "IN_PROGRESS", "COMPLETED"] as const)
      await workOrdersService.changeStatus(db, dispatcher, id, { status, reason: "" });

    // The technician's job is over: the form is no longer theirs to change...
    await expect(fieldService.saveServiceForm(dbA, techA, id, form({ vehicleNumber: "LATE" }))).rejects.toBeInstanceOf(
      ConflictError,
    );
    // ...but the office completes it before closing.
    await workOrdersService.saveServiceForm(db, dispatcher, id, form({ vehicleNumber: "LES-9", finalResult: "RESOLVED" }));
    expect((await workOrdersService.get(db, dispatcher, id)).serviceForm?.vehicleNumber).toBe("LES-9");

    await workOrdersService.changeStatus(db, dispatcher, id, { status: "CLOSED", reason: "" });
    await expect(
      workOrdersService.saveServiceForm(db, dispatcher, id, form({ vehicleNumber: "AFTER" })),
    ).rejects.toThrow(/can no longer be changed/);
  });
});
