import "server-only";
import type { AppointmentStatus, Prisma, WorkOrderStatus } from "@prisma/client";
import type { AppointmentDto, Board, BoardAppointment, ScheduleInput } from "./scheduling.schema";
import type { CurrentUser } from "@/lib/auth";
import type { AppDb } from "@/lib/db";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { dayRangeUtc, formatIn, fromCompanyTime, todayIn } from "@/lib/tz";

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const ACTIVE: AppointmentStatus[] = ["SCHEDULED", "EN_ROUTE", "ON_SITE"];
/** A visit can be (re)scheduled until the technician starts work. */
const MOVABLE: WorkOrderStatus[] = ["NEW", "SCHEDULED", "DISPATCHED", "ON_HOLD"];
const MIN_MS = 60_000;
const LOCAL = "yyyy-MM-dd'T'HH:mm";

const companyOf = (actor: CurrentUser) => {
  if (!actor.companyId) throw new ForbiddenError("This action needs a company account.");
  return actor.companyId;
};

async function zoneOf(db: AppDb, companyId: string) {
  const c = await db.company.findFirst({ where: { id: companyId }, select: { timeZone: true } });
  return c?.timeZone ?? "UTC";
}

const apptSelect = {
  id: true,
  workOrderId: true,
  technicianId: true,
  status: true,
  scheduledStart: true,
  scheduledEnd: true,
  technician: { select: { fullName: true } },
  workOrder: {
    select: {
      number: true,
      title: true,
      priority: true,
      status: true,
      customer: { select: { name: true } },
      address: { select: { label: true, addressLine: true } },
    },
  },
} satisfies Prisma.AppointmentSelect;

const site = (a: { label: string | null; addressLine: string } | null) =>
  a ? (a.label ? `${a.label} — ${a.addressLine}` : a.addressLine) : null;

/** Another active visit of this technician that overlaps [start, end), if any. */
function findClash(db: AppDb, technicianId: string, start: Date, end: Date, ignoreWorkOrderId: string) {
  return db.appointment.findFirst({
    where: {
      technicianId,
      status: { in: ACTIVE },
      scheduledStart: { lt: end },
      scheduledEnd: { gt: start },
      workOrderId: { not: ignoreWorkOrderId },
    },
    select: { scheduledStart: true, scheduledEnd: true, workOrder: { select: { number: true } } },
  });
}

export const schedulingService = {
  /** One day of the dispatch board: technicians with their visits, plus jobs waiting for a slot. */
  async board(db: AppDb, actor: CurrentUser, date?: string): Promise<Board> {
    const tz = await zoneOf(db, companyOf(actor));
    const today = todayIn(tz);
    const day = date ?? today;
    const { start, end } = dayRangeUtc(day, tz);
    const weekday = DAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];

    const [techs, appts, jobs] = await Promise.all([
      db.user.findMany({
        where: { role: "TECHNICIAN", isActive: true },
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          fullName: true,
          technicianProfile: { select: { color: true, workStart: true, workEnd: true, workingDays: true } },
        },
      }),
      db.appointment.findMany({
        where: { status: { in: [...ACTIVE, "COMPLETED"] }, scheduledStart: { lt: end }, scheduledEnd: { gt: start } },
        orderBy: { scheduledStart: "asc" },
        select: apptSelect,
      }),
      db.workOrder.findMany({
        where: { status: "NEW", appointments: { none: { status: { in: ACTIVE } } } },
        orderBy: [{ priority: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
        take: 100,
        select: {
          id: true,
          number: true,
          title: true,
          priority: true,
          dueDate: true,
          customer: { select: { name: true } },
          address: { select: { label: true, addressLine: true } },
        },
      }),
    ]);

    const now = new Date();
    const dayMs = end.getTime() - start.getTime();
    const toBoard = (a: (typeof appts)[number]): BoardAppointment => {
      const s = Math.max(a.scheduledStart.getTime(), start.getTime());
      const e = Math.min(a.scheduledEnd.getTime(), end.getTime());
      return {
        id: a.id,
        workOrderId: a.workOrderId,
        number: a.workOrder.number,
        title: a.workOrder.title,
        customerName: a.workOrder.customer.name,
        siteLabel: site(a.workOrder.address),
        priority: a.workOrder.priority,
        workOrderStatus: a.workOrder.status,
        status: a.status,
        start: a.scheduledStart.toISOString(),
        end: a.scheduledEnd.toISOString(),
        startMin: Math.round(((s - start.getTime()) / dayMs) * 1440),
        endMin: Math.round(((e - start.getTime()) / dayMs) * 1440),
        startLocal: formatIn(a.scheduledStart, tz, LOCAL),
        durationMin: Math.round((a.scheduledEnd.getTime() - a.scheduledStart.getTime()) / MIN_MS),
      };
    };

    return {
      date: day,
      today,
      timeZone: tz,
      technicians: techs.map((t) => {
        const p = t.technicianProfile;
        return {
          id: t.id,
          name: t.fullName,
          color: p?.color ?? "#3b82f6",
          workStart: p?.workStart ?? "09:00",
          workEnd: p?.workEnd ?? "18:00",
          working: p ? p.workingDays.includes(weekday) : true,
          appointments: appts.filter((a) => a.technicianId === t.id).map(toBoard),
        };
      }),
      unscheduled: jobs.map((j) => ({
        id: j.id,
        number: j.number,
        title: j.title,
        customerName: j.customer.name,
        siteLabel: site(j.address),
        priority: j.priority,
        dueDate: j.dueDate?.toISOString() ?? null,
        overdue: !!j.dueDate && j.dueDate < now,
      })),
    };
  },

  /** The current visit of a work order, if it has one. */
  async forWorkOrder(db: AppDb, actor: CurrentUser, workOrderId: string): Promise<AppointmentDto | null> {
    const tz = await zoneOf(db, companyOf(actor));
    const a = await db.appointment.findFirst({
      where: { workOrderId, status: { in: ACTIVE } },
      orderBy: { scheduledStart: "asc" },
      select: apptSelect,
    });
    if (!a) return null;
    return {
      id: a.id,
      technicianId: a.technicianId,
      technicianName: a.technician.fullName,
      status: a.status,
      start: a.scheduledStart.toISOString(),
      end: a.scheduledEnd.toISOString(),
      startLocal: formatIn(a.scheduledStart, tz, LOCAL),
      durationMin: Math.round((a.scheduledEnd.getTime() - a.scheduledStart.getTime()) / MIN_MS),
    };
  },

  /**
   * Gives a work order a technician and a time slot. The first time it also moves the work order
   * to Scheduled; scheduling again simply moves the visit. A technician cannot be double-booked.
   */
  async schedule(db: AppDb, actor: CurrentUser, workOrderId: string, input: ScheduleInput) {
    const companyId = companyOf(actor);
    const tz = await zoneOf(db, companyId);
    const start = fromCompanyTime(input.start, tz);
    if (Number.isNaN(start.getTime())) throw new BadRequestError("Choose a valid start time.", { start: ["Invalid."] });
    const end = new Date(start.getTime() + input.durationMin * MIN_MS);

    const [wo, tech] = await Promise.all([
      db.workOrder.findFirst({ where: { id: workOrderId }, select: { id: true, number: true, status: true } }),
      db.user.findFirst({
        where: { id: input.technicianId, role: "TECHNICIAN", isActive: true },
        select: { id: true, fullName: true },
      }),
    ]);
    if (!wo) throw new NotFoundError("Work order", workOrderId);
    if (!tech)
      throw new BadRequestError("That technician was not found.", { technicianId: ["Choose an active technician."] });
    if (!MOVABLE.includes(wo.status)) {
      throw new ConflictError(
        wo.status === "IN_PROGRESS"
          ? `${wo.number} is already in progress and cannot be rescheduled.`
          : `${wo.number} is ${wo.status === "CANCELLED" ? "cancelled" : wo.status === "CLOSED" ? "closed" : "completed"}. Reopen it first.`,
      );
    }

    await db.$withTx(async () => {
      const clash = await findClash(db, tech.id, start, end, workOrderId);
      if (clash) {
        const t = (d: Date) => formatIn(d, tz, "HH:mm");
        const msg = `${tech.fullName} is already booked ${t(clash.scheduledStart)}–${t(clash.scheduledEnd)} on ${clash.workOrder.number}.`;
        throw new ConflictError(msg, { start: [msg] });
      }
      const current = await db.appointment.findFirst({
        where: { workOrderId, status: { in: ACTIVE } },
        select: { id: true },
      });
      if (current) {
        await db.appointment.update({
          where: { id: current.id },
          data: { technicianId: tech.id, scheduledStart: start, scheduledEnd: end },
        });
      } else {
        await db.appointment.create({
          data: { companyId, workOrderId, technicianId: tech.id, scheduledStart: start, scheduledEnd: end },
        });
      }
      // New and On hold jobs become Scheduled; Scheduled/Dispatched jobs keep their status.
      if (wo.status === "NEW" || wo.status === "ON_HOLD") {
        const res = await db.workOrder.updateMany({
          where: { id: workOrderId, status: wo.status },
          data: { status: "SCHEDULED" },
        });
        if (res.count === 0) throw new ConflictError("The work order was changed by someone else. Refresh and retry.");
        await db.workOrderStatusChange.create({
          data: {
            companyId,
            workOrderId,
            fromStatus: wo.status,
            toStatus: "SCHEDULED",
            reason: `Scheduled for ${tech.fullName}`,
            changedById: actor.id,
          },
        });
      }
    });
    return this.forWorkOrder(db, actor, workOrderId);
  },

  /** Takes the work order off the board: the visit is cancelled and a Scheduled job goes back to New. */
  async unschedule(db: AppDb, actor: CurrentUser, workOrderId: string) {
    const companyId = companyOf(actor);
    const wo = await db.workOrder.findFirst({ where: { id: workOrderId }, select: { number: true, status: true } });
    if (!wo) throw new NotFoundError("Work order", workOrderId);
    if (wo.status === "DISPATCHED")
      throw new ConflictError(`${wo.number} is dispatched. Move it back to scheduled first.`);
    if (wo.status !== "SCHEDULED" && wo.status !== "ON_HOLD")
      throw new ConflictError(`${wo.number} has nothing to unschedule.`);

    await db.$withTx(async () => {
      await db.appointment.updateMany({
        where: { workOrderId, status: { in: ACTIVE } },
        data: { status: "CANCELLED" },
      });
      if (wo.status === "SCHEDULED") {
        await db.workOrder.updateMany({ where: { id: workOrderId, status: "SCHEDULED" }, data: { status: "NEW" } });
        await db.workOrderStatusChange.create({
          data: {
            companyId,
            workOrderId,
            fromStatus: "SCHEDULED",
            toStatus: "NEW",
            reason: "Removed from the dispatch board",
            changedById: actor.id,
          },
        });
      }
    });
  },
};

/**
 * Keeps the visit in step with its work order (called after every work order status change):
 * dispatched → en route, in progress → on site, completed → completed,
 * cancelled or back to new → cancelled. On hold keeps the booking so the slot is not lost.
 */
export async function syncAppointments(db: AppDb, workOrderId: string, to: WorkOrderStatus) {
  const next: Partial<Record<WorkOrderStatus, AppointmentStatus>> = {
    SCHEDULED: "SCHEDULED",
    DISPATCHED: "EN_ROUTE",
    IN_PROGRESS: "ON_SITE",
    COMPLETED: "COMPLETED",
    CLOSED: "COMPLETED",
    CANCELLED: "CANCELLED",
    NEW: "CANCELLED",
  };
  const status = next[to];
  if (!status) return;
  await db.appointment.updateMany({ where: { workOrderId, status: { in: ACTIVE } }, data: { status } });
}
