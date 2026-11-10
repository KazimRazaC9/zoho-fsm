/**
 * Phase 4 acceptance: "a dispatcher assigns a job to a technician and a time slot; a technician
 * cannot be double-booked; the visit follows the work order's status".
 * Runs against the seeded dev database (Demo company) and removes what it creates.
 */
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth";
import { createDb, prismaBase, tenantContext, type AppDb } from "@/lib/db";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/errors";
import { schedulingService } from "@/modules/scheduling";
import { workOrdersService } from "@/modules/work-orders";

const owner = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
const stamp = Date.now().toString(36);
// A far-future day so the test never collides with seeded visits.
const DAY = "2031-03-10";

let dispatcher: CurrentUser;
let db: AppDb;
let acmeDb: AppDb;
let acmeAdmin: CurrentUser;
let customerId: string;
let techA: string;
let techB: string;
const woIds: string[] = [];

const asUser = (u: { id: string; role: string; companyId: string | null; fullName: string; email: string }) =>
  ({
    id: u.id,
    role: u.role,
    companyId: u.companyId,
    fullName: u.fullName,
    email: u.email,
    via: "session",
  }) as CurrentUser;

async function newJob(title: string) {
  const w = await workOrdersService.create(db, dispatcher, {
    customerId,
    addressId: "",
    assetId: "",
    title: `${title} ${stamp}`,
    description: "",
    priority: "MEDIUM",
    dueDate: "",
    checklistTemplateId: "",
  });
  woIds.push(w.id);
  return w.id;
}

beforeAll(async () => {
  const d = await owner.user.findFirstOrThrow({ where: { email: "dispatcher@demo.local" } });
  dispatcher = asUser(d);
  db = createDb(tenantContext(d.companyId!, d.id));
  const a = await owner.user.findFirstOrThrow({ where: { email: "admin@acme.local" } });
  acmeAdmin = asUser(a);
  acmeDb = createDb(tenantContext(a.companyId!, a.id));
  const techs = await owner.user.findMany({
    where: { companyId: d.companyId!, role: "TECHNICIAN", isActive: true },
    orderBy: { email: "asc" },
  });
  techA = techs[0].id;
  techB = techs[1].id;
  customerId = (await owner.customer.findFirstOrThrow({ where: { companyId: d.companyId!, deletedAt: null } })).id;
});

afterAll(async () => {
  const where = { workOrderId: { in: woIds } };
  await owner.auditLog.deleteMany({ where: { entityId: { in: woIds } } });
  await owner.appointment.deleteMany({ where });
  await owner.workOrderStatusChange.deleteMany({ where });
  await owner.workOrderChecklistItem.deleteMany({ where });
  await owner.workOrder.deleteMany({ where: { id: { in: woIds } } });
  await owner.$disconnect();
  await prismaBase.$disconnect();
});

describe("Phase 4 — scheduling and dispatch", () => {
  it("assigns a technician and slot, moves the job to Scheduled and shows it on the board", async () => {
    const id = await newJob("P4 first");
    const before = await schedulingService.board(db, dispatcher, DAY);
    expect(before.unscheduled.map((j) => j.id)).toContain(id);

    const visit = await schedulingService.schedule(db, dispatcher, id, {
      technicianId: techA,
      start: `${DAY}T09:00`,
      durationMin: 90,
    });
    expect(visit).toMatchObject({
      technicianId: techA,
      status: "SCHEDULED",
      durationMin: 90,
      startLocal: `${DAY}T09:00`,
    });

    const wo = await workOrdersService.get(db, dispatcher, id);
    expect(wo.status).toBe("SCHEDULED");
    expect(wo.timeline.at(-1)).toMatchObject({ fromStatus: "NEW", toStatus: "SCHEDULED" });

    const board = await schedulingService.board(db, dispatcher, DAY);
    expect(board.unscheduled.map((j) => j.id)).not.toContain(id);
    const col = board.technicians.find((t) => t.id === techA)!;
    const block = col.appointments.find((a) => a.workOrderId === id)!;
    expect(block).toMatchObject({ startMin: 9 * 60, endMin: 10 * 60 + 30, durationMin: 90 });
  });

  it("refuses to double-book a technician but allows back-to-back and other technicians", async () => {
    const second = await newJob("P4 clash");
    await expect(
      schedulingService.schedule(db, dispatcher, second, {
        technicianId: techA,
        start: `${DAY}T10:00`,
        durationMin: 60,
      }),
    ).rejects.toThrow(/already booked 09:00–10:30/);
    await expect(
      schedulingService.schedule(db, dispatcher, second, {
        technicianId: techA,
        start: `${DAY}T10:30`,
        durationMin: 60,
      }),
    ).resolves.toMatchObject({ technicianId: techA });
    const third = await newJob("P4 other tech");
    await expect(
      schedulingService.schedule(db, dispatcher, third, {
        technicianId: techB,
        start: `${DAY}T09:30`,
        durationMin: 60,
      }),
    ).resolves.toMatchObject({ technicianId: techB });
  });

  it("rescheduling moves the same visit instead of adding another", async () => {
    const id = woIds[0];
    await schedulingService.schedule(db, dispatcher, id, {
      technicianId: techB,
      start: `${DAY}T14:00`,
      durationMin: 60,
    });
    expect(await owner.appointment.count({ where: { workOrderId: id, status: { not: "CANCELLED" } } })).toBe(1);
    const visit = await schedulingService.forWorkOrder(db, dispatcher, id);
    expect(visit).toMatchObject({ technicianId: techB, startLocal: `${DAY}T14:00` });
  });

  it("rejects unknown technicians, bad input and other companies", async () => {
    const id = woIds[0];
    await expect(
      schedulingService.schedule(db, dispatcher, id, {
        technicianId: dispatcher.id,
        start: `${DAY}T09:00`,
        durationMin: 60,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
    await expect(schedulingService.unschedule(acmeDb, acmeAdmin, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      schedulingService.schedule(acmeDb, acmeAdmin, id, {
        technicianId: techA,
        start: `${DAY}T09:00`,
        durationMin: 60,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("the visit follows the work order status and blocks moves once work has started", async () => {
    const id = woIds[0];
    await workOrdersService.changeStatus(db, dispatcher, id, { status: "DISPATCHED", reason: "" });
    expect((await schedulingService.forWorkOrder(db, dispatcher, id))?.status).toBe("EN_ROUTE");
    await expect(schedulingService.unschedule(db, dispatcher, id)).rejects.toThrow(/dispatched/);

    await workOrdersService.changeStatus(db, dispatcher, id, { status: "IN_PROGRESS", reason: "" });
    expect((await schedulingService.forWorkOrder(db, dispatcher, id))?.status).toBe("ON_SITE");
    await expect(
      schedulingService.schedule(db, dispatcher, id, { technicianId: techB, start: `${DAY}T16:00`, durationMin: 60 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("unscheduling returns a Scheduled job to New; cancelling a job frees the slot", async () => {
    const id = woIds[1];
    await schedulingService.unschedule(db, dispatcher, id);
    expect((await workOrdersService.get(db, dispatcher, id)).status).toBe("NEW");
    expect(await schedulingService.forWorkOrder(db, dispatcher, id)).toBeNull();

    const other = woIds[2];
    await workOrdersService.changeStatus(db, dispatcher, other, { status: "CANCELLED", reason: "Customer cancelled" });
    expect(await schedulingService.forWorkOrder(db, dispatcher, other)).toBeNull();
    // The slot is free again.
    const again = await newJob("P4 reuse");
    await expect(
      schedulingService.schedule(db, dispatcher, again, {
        technicianId: techB,
        start: `${DAY}T09:30`,
        durationMin: 60,
      }),
    ).resolves.toMatchObject({ technicianId: techB });
  });
});
