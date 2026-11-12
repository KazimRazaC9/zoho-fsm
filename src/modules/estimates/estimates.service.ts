import "server-only";
import { Prisma, type EstimateStatus } from "@prisma/client";
import {
  ESTIMATE_TRANSITIONS,
  ESTIMATE_STATUS_LABEL,
  type ConvertEstimateInput,
  type DocLine,
  type EstimateDetail,
  type EstimateInput,
  type EstimateListItem,
  type EstimateListQuery,
} from "./estimates.schema";
import type { CurrentUser } from "@/lib/auth";
import type { AppDb } from "@/lib/db";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { computeLine, computeTotals } from "@/lib/money";
import { nextNumber } from "@/lib/numbers";
import { paged, type PagedResult } from "@/lib/pagination";
import { todayIn } from "@/lib/tz";
import { dateOnly, dateOrNull, nullIfEmpty } from "@/lib/validation";
import { workOrdersService, type LineInput } from "@/modules/work-orders";

const live = { deletedAt: null };

const select = {
  id: true,
  number: true,
  customerId: true,
  customer: { select: { name: true } },
  addressId: true,
  address: { select: { label: true, addressLine: true } },
  requestId: true,
  request: { select: { number: true } },
  status: true,
  subTotal: true,
  tax: true,
  total: true,
  validUntil: true,
  notes: true,
  createdAt: true,
  lines: {
    where: live,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      serviceItemId: true,
      description: true,
      qty: true,
      unitPrice: true,
      taxPercent: true,
      lineTotal: true,
    },
  },
  workOrders: { where: live, take: 1, orderBy: { createdAt: "desc" }, select: { id: true, number: true } },
} satisfies Prisma.EstimateSelect;
type Row = Prisma.EstimateGetPayload<{ select: typeof select }>;

const n = (d: Prisma.Decimal) => Number(d);

async function zoneOf(db: AppDb, companyId: string) {
  const c = await db.company.findFirst({ where: { id: companyId }, select: { timeZone: true } });
  return c?.timeZone ?? "UTC";
}

const companyOf = (actor: CurrentUser) => {
  if (!actor.companyId) throw new ForbiddenError("This action needs a company account.");
  return actor.companyId;
};

function toItem(r: Row, today: string): EstimateListItem {
  const validUntil = dateOnly(r.validUntil);
  return {
    id: r.id,
    number: r.number,
    customerId: r.customerId,
    customerName: r.customer.name,
    status: r.status,
    total: n(r.total),
    validUntil,
    expired: !!validUntil && validUntil < today && (r.status === "DRAFT" || r.status === "SENT"),
    createdAt: r.createdAt.toISOString(),
    requestNumber: r.request?.number ?? null,
    workOrder: r.workOrders[0] ?? null,
  };
}

function toDetail(r: Row, today: string): EstimateDetail {
  const lines: DocLine[] = r.lines.map((l) => ({
    id: l.id,
    serviceItemId: l.serviceItemId,
    description: l.description,
    qty: n(l.qty),
    unitPrice: n(l.unitPrice),
    taxPercent: n(l.taxPercent),
    lineTotal: n(l.lineTotal),
  }));
  return {
    ...toItem(r, today),
    addressId: r.addressId,
    siteLabel: r.address
      ? r.address.label
        ? `${r.address.label} — ${r.address.addressLine}`
        : r.address.addressLine
      : null,
    requestId: r.requestId,
    notes: r.notes,
    subTotal: n(r.subTotal),
    tax: n(r.tax),
    lines,
    editable: r.status === "DRAFT",
  };
}

async function getRow(db: AppDb, id: string) {
  const r = await db.estimate.findFirst({ where: { id }, select });
  if (!r) throw new NotFoundError("Estimate", id);
  return r;
}

async function editableOrThrow(db: AppDb, id: string) {
  const r = await db.estimate.findFirst({ where: { id }, select: { id: true, number: true, status: true } });
  if (!r) throw new NotFoundError("Estimate", id);
  if (r.status !== "DRAFT")
    throw new ConflictError(
      `${r.number} is ${ESTIMATE_STATUS_LABEL[r.status].toLowerCase()}. Revise it to make changes.`,
    );
  return r;
}

/** Totals are always recalculated on the server from the lines. */
async function recompute(db: AppDb, id: string) {
  const lines = await db.estimateLine.findMany({
    where: { estimateId: id },
    select: { qty: true, unitPrice: true, taxPercent: true },
  });
  const t = computeTotals(lines);
  await db.estimate.update({ where: { id }, data: { subTotal: t.subTotal, tax: t.tax, total: t.total } });
}

const lineData = (i: LineInput) => ({
  serviceItemId: i.serviceItemId || null,
  description: i.description,
  qty: new Prisma.Decimal(i.qty.toFixed(2)),
  unitPrice: new Prisma.Decimal(i.unitPrice.toFixed(2)),
  taxPercent: new Prisma.Decimal(i.taxPercent.toFixed(2)),
  lineTotal: computeLine(i).lineTotal,
});

async function assertTargets(db: AppDb, i: EstimateInput) {
  const [c, a] = await Promise.all([
    db.customer.count({ where: { id: i.customerId } }),
    i.addressId ? db.serviceAddress.count({ where: { id: i.addressId, customerId: i.customerId } }) : 1,
  ]);
  if (!c) throw new BadRequestError("Customer was not found.", { customerId: ["Choose an existing customer."] });
  if (!a)
    throw new BadRequestError("That site is not one of this customer's.", {
      addressId: ["Choose one of this customer's sites."],
    });
  if (i.requestId) {
    const r = await db.serviceRequest.findFirst({
      where: { id: i.requestId, customerId: i.customerId },
      select: { status: true },
    });
    if (!r)
      throw new BadRequestError("That request is not this customer's.", { requestId: ["Choose another request."] });
    if (r.status !== "NEW" && r.status !== "ESTIMATED")
      throw new ConflictError("That request is already converted or cancelled.");
  }
}

const detailsData = (i: EstimateInput) => ({
  customerId: i.customerId,
  addressId: i.addressId || null,
  validUntil: dateOrNull(i.validUntil),
  notes: nullIfEmpty(i.notes),
});

export const estimatesService = {
  async list(db: AppDb, actor: CurrentUser, q: EstimateListQuery): Promise<PagedResult<EstimateListItem>> {
    const today = todayIn(await zoneOf(db, companyOf(actor)));
    const has = q.search ? ({ contains: q.search, mode: "insensitive" } as const) : undefined;
    const where: Prisma.EstimateWhereInput = {
      ...(q.status !== "all" ? { status: q.status } : {}),
      ...(has ? { OR: [{ number: has }, { customer: { name: has } }] } : {}),
    };
    const [items, total] = await Promise.all([
      db.estimate.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select,
      }),
      db.estimate.count({ where }),
    ]);
    return paged(
      items.map((r) => toItem(r, today)),
      total,
      q,
    );
  },

  async get(db: AppDb, actor: CurrentUser, id: string): Promise<EstimateDetail> {
    const today = todayIn(await zoneOf(db, companyOf(actor)));
    return toDetail(await getRow(db, id), today);
  },

  async create(db: AppDb, actor: CurrentUser, input: EstimateInput): Promise<EstimateDetail> {
    const companyId = companyOf(actor);
    await assertTargets(db, input);
    const id = await db.$withTx(async () => {
      const number = await nextNumber(db, "EST");
      const e = await db.estimate.create({
        data: { companyId, number, requestId: input.requestId || null, ...detailsData(input) },
        select: { id: true },
      });
      if (input.requestId) {
        await db.serviceRequest.updateMany({
          where: { id: input.requestId, status: "NEW" },
          data: { status: "ESTIMATED" },
        });
      }
      return e.id;
    });
    return this.get(db, actor, id);
  },

  async update(db: AppDb, actor: CurrentUser, id: string, input: EstimateInput): Promise<EstimateDetail> {
    const cur = await editableOrThrow(db, id);
    await assertTargets(db, { ...input, requestId: "" });
    await db.estimate.update({ where: { id: cur.id }, data: detailsData(input) });
    return this.get(db, actor, id);
  },

  /** Only drafts can be deleted; a request that was waiting on it goes back to New. */
  async remove(db: AppDb, id: string) {
    const cur = await editableOrThrow(db, id);
    const e = await db.estimate.findFirst({ where: { id: cur.id }, select: { requestId: true } });
    await db.$withTx(async () => {
      await db.estimate.delete({ where: { id } });
      if (e?.requestId) {
        const others = await db.estimate.count({ where: { requestId: e.requestId } });
        if (others === 0)
          await db.serviceRequest.updateMany({
            where: { id: e.requestId, status: "ESTIMATED" },
            data: { status: "NEW" },
          });
      }
    });
  },

  async changeStatus(db: AppDb, actor: CurrentUser, id: string, to: EstimateStatus): Promise<EstimateDetail> {
    const r = await getRow(db, id);
    if (!ESTIMATE_TRANSITIONS[r.status].includes(to)) {
      const allowed = ESTIMATE_TRANSITIONS[r.status].map((s) => ESTIMATE_STATUS_LABEL[s].toLowerCase()).join(", ");
      throw new ConflictError(
        `${r.number} is ${ESTIMATE_STATUS_LABEL[r.status].toLowerCase()}. ${allowed ? `Allowed: ${allowed}.` : "It cannot be changed."}`,
      );
    }
    if (to === "SENT" && r.lines.length === 0)
      throw new ConflictError("Add at least one line before sending the estimate.");
    if (to === "DRAFT" && r.workOrders.length > 0)
      throw new ConflictError(`${r.number} already has work order ${r.workOrders[0].number}.`);
    const res = await db.estimate.updateMany({ where: { id, status: r.status }, data: { status: to } });
    if (res.count === 0) throw new ConflictError("The estimate was changed by someone else. Refresh and try again.");
    return this.get(db, actor, id);
  },

  // ---------------------------------------------------------------- lines
  async addLine(db: AppDb, actor: CurrentUser, id: string, input: LineInput) {
    const companyId = companyOf(actor);
    await editableOrThrow(db, id);
    await db.$withTx(async () => {
      const max = await db.estimateLine.aggregate({ where: { estimateId: id }, _max: { sortOrder: true } });
      await db.estimateLine.create({
        data: { companyId, estimateId: id, sortOrder: (max._max.sortOrder ?? 0) + 1, ...lineData(input) },
      });
      await recompute(db, id);
    });
  },

  async updateLine(db: AppDb, id: string, lineId: string, input: LineInput) {
    await editableOrThrow(db, id);
    await db.$withTx(async () => {
      const res = await db.estimateLine.updateMany({ where: { id: lineId, estimateId: id }, data: lineData(input) });
      if (res.count === 0) throw new NotFoundError("Line", lineId);
      await recompute(db, id);
    });
  },

  async removeLine(db: AppDb, id: string, lineId: string) {
    await editableOrThrow(db, id);
    await db.$withTx(async () => {
      const res = await db.estimateLine.deleteMany({ where: { id: lineId, estimateId: id } });
      if (res.count === 0) throw new NotFoundError("Line", lineId);
      await recompute(db, id);
    });
  },

  /**
   * Approved estimate → work order (once): customer, site, request link and every line are copied,
   * and a waiting service request becomes Converted.
   */
  async convert(db: AppDb, actor: CurrentUser, id: string, input: ConvertEstimateInput) {
    const r = await getRow(db, id);
    if (r.status !== "APPROVED")
      throw new ConflictError(`${r.number} must be approved before it becomes a work order.`);
    if (r.workOrders.length > 0) throw new ConflictError(`${r.number} already became ${r.workOrders[0].number}.`);
    const req = r.requestId
      ? await db.serviceRequest.findFirst({
          where: { id: r.requestId },
          select: { title: true, description: true, priority: true, assetId: true, zohoTicket: true },
        })
      : null;

    return db.$withTx(async () => {
      const wo = await workOrdersService.create(
        db,
        actor,
        {
          customerId: r.customerId,
          addressId: r.addressId ?? "",
          assetId: req?.assetId ?? "",
          title: req?.title ?? `Work for ${r.number}`,
          description: req?.description ?? r.notes ?? "",
          zohoTicket: req?.zohoTicket ?? "",
          purchaseOrder: "",
          priority: req?.priority ?? "MEDIUM",
          dueDate: input.dueDate,
          checklistTemplateId: input.checklistTemplateId,
        },
        {
          requestId: r.requestId ?? undefined,
          estimateId: id,
          lines: r.lines.map((l) => ({
            serviceItemId: l.serviceItemId ?? "",
            description: l.description,
            qty: n(l.qty),
            unitPrice: n(l.unitPrice),
            taxPercent: n(l.taxPercent),
          })),
        },
      );
      if (r.requestId)
        await db.serviceRequest.updateMany({
          where: { id: r.requestId, status: { in: ["NEW", "ESTIMATED"] } },
          data: { status: "CONVERTED" },
        });
      return { id: wo.id, number: wo.number };
    });
  },
};
