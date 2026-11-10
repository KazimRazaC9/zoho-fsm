import "server-only";
import { Prisma, type AppointmentStatus, type WorkOrderStatus } from "@prisma/client";
import type {
  AddPartInput,
  FieldAction,
  FieldJob,
  FieldJobDetail,
  FieldJobList,
  LiveTechnician,
  LocationInput,
  PartOption,
  TransitionInput,
} from "./field.schema";
import type { CurrentUser } from "@/lib/auth";
import type { AppDb } from "@/lib/db";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { formatIn, todayIn } from "@/lib/tz";
import { workOrdersService } from "@/modules/work-orders";

const companyOf = (actor: CurrentUser) => {
  if (!actor.companyId) throw new ForbiddenError("This action needs a company account.");
  return actor.companyId;
};

async function zoneOf(db: AppDb, companyId: string) {
  const c = await db.company.findFirst({ where: { id: companyId }, select: { timeZone: true } });
  return c?.timeZone ?? "UTC";
}

/** A technician can only touch work orders that have (or had) a visit assigned to them. */
export async function assertMine(db: AppDb, actor: CurrentUser, workOrderId: string) {
  const a = await db.appointment.findFirst({
    where: { workOrderId, technicianId: actor.id, status: { not: "CANCELLED" } },
    orderBy: { scheduledStart: "desc" },
    select: { id: true, status: true, scheduledStart: true, scheduledEnd: true },
  });
  if (!a) throw new NotFoundError("Job", workOrderId);
  return a;
}

const toDec = (n: number | null | undefined) => (n == null ? null : new Prisma.Decimal(n.toFixed(6)));
const toDec2 = (n: number | null | undefined) => (n == null ? null : new Prisma.Decimal(n.toFixed(2)));

const ACTIONS_FOR: Partial<Record<WorkOrderStatus, FieldAction[]>> = {
  SCHEDULED: ["on-my-way", "start"],
  DISPATCHED: ["start"],
  IN_PROGRESS: ["complete", "hold"],
  ON_HOLD: ["resume"],
};

async function openTimeSheet(db: AppDb, actor: CurrentUser, appointmentId: string, loc?: LocationInput | null) {
  const open = await db.timeSheet.findFirst({ where: { appointmentId, checkOutAt: null }, select: { id: true } });
  if (open) return;
  await db.timeSheet.create({
    data: {
      companyId: companyOf(actor),
      appointmentId,
      technicianId: actor.id,
      checkInAt: new Date(),
      checkInLat: toDec(loc?.latitude),
      checkInLng: toDec(loc?.longitude),
    },
  });
}

async function closeTimeSheet(db: AppDb, appointmentId: string, loc?: LocationInput | null) {
  const open = await db.timeSheet.findFirst({
    where: { appointmentId, checkOutAt: null },
    select: { id: true, checkInAt: true },
  });
  if (!open) return;
  const now = new Date();
  await db.timeSheet.update({
    where: { id: open.id },
    data: {
      checkOutAt: now,
      checkOutLat: toDec(loc?.latitude),
      checkOutLng: toDec(loc?.longitude),
      durationMinutes: Math.max(0, Math.round((now.getTime() - open.checkInAt.getTime()) / 60_000)),
    },
  });
}

export const fieldService = {
  /** The signed-in technician's visits: open ones plus anything finished in the last 3 days. */
  async myJobs(db: AppDb, actor: CurrentUser): Promise<FieldJobList> {
    const tz = await zoneOf(db, companyOf(actor));
    const since = new Date(Date.now() - 3 * 24 * 3600_000);
    const rows = await db.appointment.findMany({
      where: { technicianId: actor.id, status: { not: "CANCELLED" }, scheduledEnd: { gt: since } },
      orderBy: { scheduledStart: "asc" },
      take: 200,
      select: {
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        workOrder: {
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            priority: true,
            customer: { select: { name: true, phone: true } },
            address: { select: { label: true, addressLine: true } },
            asset: { select: { name: true } },
          },
        },
      },
    });
    const jobs: FieldJob[] = rows.map((a) => {
      const w = a.workOrder;
      return {
        workOrderId: w.id,
        number: w.number,
        title: w.title,
        status: w.status,
        visitStatus: a.status,
        priority: w.priority,
        customerName: w.customer.name,
        customerPhone: w.customer.phone,
        siteLabel: w.address
          ? w.address.label
            ? `${w.address.label} — ${w.address.addressLine}`
            : w.address.addressLine
          : null,
        assetName: w.asset?.name ?? null,
        day: formatIn(a.scheduledStart, tz, "yyyy-MM-dd"),
        startTime: formatIn(a.scheduledStart, tz, "HH:mm"),
        endTime: formatIn(a.scheduledEnd, tz, "HH:mm"),
      };
    });
    return { today: todayIn(tz), timeZone: tz, jobs };
  },

  async job(db: AppDb, actor: CurrentUser, workOrderId: string): Promise<FieldJobDetail> {
    const visit = await assertMine(db, actor, workOrderId);
    const tz = await zoneOf(db, companyOf(actor));
    const wo = await workOrdersService.get(db, actor, workOrderId);
    const sheet = await db.timeSheet.findFirst({
      where: { appointmentId: visit.id, checkOutAt: null },
      select: { checkInAt: true },
    });
    const a = wo.address;
    return {
      id: wo.id,
      number: wo.number,
      title: wo.title,
      description: wo.description,
      status: wo.status,
      priority: wo.priority,
      customer: { name: wo.customerName, phone: wo.customerPhone },
      address: a ? { label: a.label, fullAddress: a.fullAddress, latitude: a.latitude, longitude: a.longitude } : null,
      assetName: wo.assetName,
      visit: {
        day: formatIn(visit.scheduledStart, tz, "yyyy-MM-dd"),
        startTime: formatIn(visit.scheduledStart, tz, "HH:mm"),
        endTime: formatIn(visit.scheduledEnd, tz, "HH:mm"),
        status: visit.status,
      },
      actions: ACTIONS_FOR[wo.status] ?? [],
      checkedInAt: sheet?.checkInAt.toISOString() ?? null,
      checklist: wo.checklist.map((c) => ({ id: c.id, text: c.text, isDone: c.isDone })),
      // Prices stay with the office; technicians only see what was used.
      parts: wo.lines.map((l) => ({ id: l.id, description: l.description, qty: l.qty })),
      notes: wo.notes
        .filter((n) => !n.isInternal || n.authorId === actor.id)
        .map((n) => ({
          id: n.id,
          text: n.text,
          author: n.author,
          createdAt: n.createdAt,
          mine: n.authorId === actor.id,
        })),
      photos: wo.attachments
        .filter((f) => f.kind === "PHOTO" || f.kind === "SIGNATURE")
        .map((f) => ({ id: f.id, fileName: f.fileName, kind: f.kind })),
      requireSignature: wo.requireSignatureOnComplete,
      hasSignature: wo.attachments.some((f) => f.kind === "SIGNATURE"),
      closed: wo.status === "COMPLETED" || wo.status === "CANCELLED",
    };
  },

  /** Move the job along: on my way, start, hold, resume, complete. The state machine still applies. */
  async transition(db: AppDb, actor: CurrentUser, workOrderId: string, input: TransitionInput) {
    const visit = await assertMine(db, actor, workOrderId);
    const wo = await db.workOrder.findFirst({ where: { id: workOrderId }, select: { status: true, number: true } });
    if (!wo) throw new NotFoundError("Job", workOrderId);
    const allowed = ACTIONS_FOR[wo.status] ?? [];
    if (!allowed.includes(input.action)) {
      throw new ConflictError(`${wo.number} is ${wo.status.toLowerCase().replace("_", " ")}; you cannot do that now.`);
    }
    const move = (status: WorkOrderStatus, reason = "") =>
      workOrdersService.changeStatus(db, actor, workOrderId, { status, reason });

    switch (input.action) {
      case "on-my-way":
        await move("DISPATCHED");
        break;
      case "start":
        if (wo.status === "SCHEDULED") await move("DISPATCHED");
        await move("IN_PROGRESS");
        await openTimeSheet(db, actor, visit.id, input.location);
        break;
      case "resume":
        await move("IN_PROGRESS");
        await openTimeSheet(db, actor, visit.id, input.location);
        break;
      case "hold":
        await move("ON_HOLD", input.reason ?? "");
        await closeTimeSheet(db, visit.id, input.location);
        break;
      case "complete":
        await move("COMPLETED");
        await closeTimeSheet(db, visit.id, input.location);
        break;
    }
    return this.job(db, actor, workOrderId);
  },

  async setChecklist(db: AppDb, actor: CurrentUser, workOrderId: string, itemId: string, isDone: boolean) {
    await assertMine(db, actor, workOrderId);
    await workOrdersService.setChecklistItem(db, actor, workOrderId, itemId, isDone);
  },

  async addNote(db: AppDb, actor: CurrentUser, workOrderId: string, text: string) {
    await assertMine(db, actor, workOrderId);
    await workOrdersService.addNote(db, actor, workOrderId, { text, isInternal: false });
  },

  async uploadFile(db: AppDb, actor: CurrentUser, workOrderId: string, file: File, signature: boolean) {
    await assertMine(db, actor, workOrderId);
    return workOrdersService.addAttachment(db, actor, workOrderId, file, signature ? "SIGNATURE" : undefined);
  },

  /** Parts the technician can pick: active catalog parts (no prices exposed). */
  async partOptions(db: AppDb): Promise<PartOption[]> {
    const rows = await db.serviceItem.findMany({
      where: { type: "PART", isActive: true },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, sku: true },
    });
    return rows;
  },

  /** "Parts used": the price and tax come from the catalog, never from the technician. */
  async addPart(db: AppDb, actor: CurrentUser, workOrderId: string, input: AddPartInput) {
    await assertMine(db, actor, workOrderId);
    const item = await db.serviceItem.findFirst({
      where: { id: input.serviceItemId, type: "PART", isActive: true },
      select: { id: true, name: true, unitPrice: true, taxPercent: true },
    });
    if (!item)
      throw new BadRequestError("That part was not found.", { serviceItemId: ["Choose a part from the list."] });
    await workOrdersService.addLine(db, actor, workOrderId, {
      serviceItemId: item.id,
      description: item.name,
      qty: input.qty,
      unitPrice: Number(item.unitPrice),
      taxPercent: Number(item.taxPercent),
    });
  },

  /** One GPS reading. Stored as history; the live map shows the latest per technician. */
  async recordLocation(db: AppDb, actor: CurrentUser, loc: LocationInput) {
    await db.technicianLocation.create({
      data: {
        companyId: companyOf(actor),
        technicianId: actor.id,
        latitude: toDec(loc.latitude)!,
        longitude: toDec(loc.longitude)!,
        accuracy: toDec2(loc.accuracy),
        speed: toDec2(loc.speed),
        heading: toDec2(loc.heading),
        recordedAt: new Date(),
      },
    });
  },

  /** Every active technician with their latest position (last 24 h) and current job. */
  async live(db: AppDb): Promise<LiveTechnician[]> {
    const since = new Date(Date.now() - 24 * 3600_000);
    const [techs, points, visits] = await Promise.all([
      db.user.findMany({
        where: { role: "TECHNICIAN", isActive: true },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true, technicianProfile: { select: { color: true } } },
      }),
      db.technicianLocation.findMany({
        where: { recordedAt: { gte: since } },
        orderBy: { recordedAt: "desc" },
        distinct: ["technicianId"],
        select: { technicianId: true, latitude: true, longitude: true, accuracy: true, recordedAt: true },
      }),
      db.appointment.findMany({
        where: { status: { in: ["EN_ROUTE", "ON_SITE"] as AppointmentStatus[] } },
        select: {
          technicianId: true,
          status: true,
          workOrder: { select: { number: true, title: true, customer: { select: { name: true } } } },
        },
      }),
    ]);
    return techs.map((t) => {
      const p = points.find((x) => x.technicianId === t.id);
      const v = visits.find((x) => x.technicianId === t.id);
      return {
        id: t.id,
        name: t.fullName,
        color: t.technicianProfile?.color ?? "#3b82f6",
        location: p
          ? {
              latitude: Number(p.latitude),
              longitude: Number(p.longitude),
              recordedAt: p.recordedAt.toISOString(),
              accuracy: p.accuracy == null ? null : Number(p.accuracy),
            }
          : null,
        job: v
          ? {
              number: v.workOrder.number,
              title: v.workOrder.title,
              customerName: v.workOrder.customer.name,
              status: v.status,
            }
          : null,
      };
    });
  },
};
