import "server-only";
import { Prisma, type InvoiceStatus } from "@prisma/client";
import {
  DEFAULT_TERMS_DAYS,
  type InvoiceDetail,
  type InvoiceInput,
  type InvoiceListItem,
  type InvoiceListQuery,
  type InvoiceSummary,
  type PaymentInput,
} from "./invoices.schema";
import type { CurrentUser } from "@/lib/auth";
import type { AppDb } from "@/lib/db";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { computeLine, computeTotals, D, ZERO } from "@/lib/money";
import { nextNumber } from "@/lib/numbers";
import { paged, type PagedResult } from "@/lib/pagination";
import { formatIn, fromCompanyTime, todayIn } from "@/lib/tz";
import { dateOnly, dateOrNull, nullIfEmpty } from "@/lib/validation";
import type { LineInput } from "@/modules/work-orders";

const live = { deletedAt: null };
const UNPAID: InvoiceStatus[] = ["SENT", "PARTIALLY_PAID"];

const select = {
  id: true,
  number: true,
  workOrderId: true,
  workOrder: { select: { number: true } },
  customerId: true,
  customer: { select: { name: true, email: true, phone: true } },
  status: true,
  subTotal: true,
  tax: true,
  discount: true,
  total: true,
  amountPaid: true,
  issueDate: true,
  dueDate: true,
  notes: true,
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
  payments: {
    where: live,
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, amount: true, method: true, reference: true, paidAt: true },
  },
} satisfies Prisma.InvoiceSelect;
type Row = Prisma.InvoiceGetPayload<{ select: typeof select }>;

const n = (d: Prisma.Decimal) => Number(d);

const companyOf = (actor: CurrentUser) => {
  if (!actor.companyId) throw new ForbiddenError("This action needs a company account.");
  return actor.companyId;
};

async function companyInfo(db: AppDb, companyId: string) {
  const c = await db.company.findFirst({
    where: { id: companyId },
    select: { timeZone: true, address: true },
  });
  return { timeZone: c?.timeZone ?? "UTC", address: c?.address ?? null };
}

/** Issued invoices past their due date read as Overdue (no stored status needed). */
function effectiveStatus(r: Pick<Row, "status" | "dueDate">, today: string): InvoiceStatus {
  const due = dateOnly(r.dueDate);
  return UNPAID.includes(r.status) && due && due < today ? "OVERDUE" : r.status;
}

function toItem(r: Row, today: string): InvoiceListItem {
  return {
    id: r.id,
    number: r.number,
    customerId: r.customerId,
    customerName: r.customer.name,
    workOrder: r.workOrderId && r.workOrder ? { id: r.workOrderId, number: r.workOrder.number } : null,
    status: effectiveStatus(r, today),
    total: n(r.total),
    amountPaid: n(r.amountPaid),
    balance: n(r.total.sub(r.amountPaid)),
    issueDate: dateOnly(r.issueDate)!,
    dueDate: dateOnly(r.dueDate),
  };
}

function toDetail(r: Row, today: string, tz: string, address: string | null): InvoiceDetail {
  return {
    ...toItem(r, today),
    customer: { name: r.customer.name, email: r.customer.email, phone: r.customer.phone, address },
    notes: r.notes,
    subTotal: n(r.subTotal),
    tax: n(r.tax),
    discount: n(r.discount),
    lines: r.lines.map((l) => ({
      id: l.id,
      serviceItemId: l.serviceItemId,
      description: l.description,
      qty: n(l.qty),
      unitPrice: n(l.unitPrice),
      taxPercent: n(l.taxPercent),
      lineTotal: n(l.lineTotal),
    })),
    payments: r.payments.map((p) => ({
      id: p.id,
      amount: n(p.amount),
      method: p.method,
      reference: p.reference,
      paidAt: p.paidAt.toISOString(),
      paidAtDay: formatIn(p.paidAt, tz, "yyyy-MM-dd"),
    })),
    editable: r.status === "DRAFT",
    canPay: UNPAID.includes(r.status),
    canVoid: (r.status === "DRAFT" || r.status === "SENT") && r.amountPaid.isZero(),
  };
}

async function getRow(db: AppDb, id: string) {
  const r = await db.invoice.findFirst({ where: { id }, select });
  if (!r) throw new NotFoundError("Invoice", id);
  return r;
}

async function draftOrThrow(db: AppDb, id: string) {
  const r = await db.invoice.findFirst({ where: { id }, select: { id: true, number: true, status: true } });
  if (!r) throw new NotFoundError("Invoice", id);
  if (r.status !== "DRAFT")
    throw new ConflictError(
      `${r.number} is ${r.status === "VOID" ? "void" : "already issued"}, so its lines are locked.`,
    );
  return r;
}

const lineData = (i: LineInput) => ({
  serviceItemId: i.serviceItemId || null,
  description: i.description,
  qty: new Prisma.Decimal(i.qty.toFixed(2)),
  unitPrice: new Prisma.Decimal(i.unitPrice.toFixed(2)),
  taxPercent: new Prisma.Decimal(i.taxPercent.toFixed(2)),
  lineTotal: computeLine(i).lineTotal,
});

/** Totals from the lines and the discount (server-side, always). */
async function recompute(db: AppDb, id: string, discount?: Prisma.Decimal.Value) {
  const [lines, cur] = await Promise.all([
    db.invoiceLine.findMany({ where: { invoiceId: id }, select: { qty: true, unitPrice: true, taxPercent: true } }),
    db.invoice.findFirst({ where: { id }, select: { discount: true } }),
  ]);
  const gross = computeTotals(lines);
  const disc = D(discount ?? cur?.discount ?? 0);
  if (disc.gt(gross.subTotal.add(gross.tax))) {
    throw new BadRequestError("The discount is more than the invoice total.", {
      discount: ["Cannot be more than the total."],
    });
  }
  const t = computeTotals(lines, disc);
  await db.invoice.update({
    where: { id },
    data: { subTotal: t.subTotal, tax: t.tax, discount: t.discount, total: t.total },
  });
}

/** amountPaid and the Paid / Partially paid status always follow the live payments. */
async function settle(db: AppDb, id: string) {
  const inv = await db.invoice.findFirst({ where: { id }, select: { status: true, total: true } });
  if (!inv || inv.status === "DRAFT" || inv.status === "VOID") return;
  const sum = await db.payment.aggregate({ where: { invoiceId: id }, _sum: { amount: true } });
  const paid = sum._sum.amount ?? ZERO;
  const status: InvoiceStatus =
    inv.total.gt(0) && paid.gte(inv.total) ? "PAID" : paid.gt(0) ? "PARTIALLY_PAID" : "SENT";
  await db.invoice.update({ where: { id }, data: { amountPaid: paid, status } });
}

const lockInvoice = (db: AppDb, id: string) =>
  db.$rawInContext((tx) => tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${id} FOR UPDATE`);

export const invoicesService = {
  async list(db: AppDb, actor: CurrentUser, q: InvoiceListQuery): Promise<PagedResult<InvoiceListItem>> {
    const today = todayIn((await companyInfo(db, companyOf(actor))).timeZone);
    const todayDate = dateOrNull(today)!;
    const has = q.search ? ({ contains: q.search, mode: "insensitive" } as const) : undefined;
    const statusWhere: Prisma.InvoiceWhereInput =
      q.status === "all"
        ? {}
        : q.status === "open"
          ? { status: { in: UNPAID } }
          : q.status === "OVERDUE"
            ? { status: { in: UNPAID }, dueDate: { lt: todayDate } }
            : q.status === "SENT" || q.status === "PARTIALLY_PAID"
              ? { status: q.status, OR: [{ dueDate: null }, { dueDate: { gte: todayDate } }] }
              : { status: q.status };
    const where: Prisma.InvoiceWhereInput = {
      ...statusWhere,
      ...(has ? { AND: [{ OR: [{ number: has }, { customer: { name: has } }, { workOrder: { number: has } }] }] } : {}),
    };
    const [items, total] = await Promise.all([
      db.invoice.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select,
      }),
      db.invoice.count({ where }),
    ]);
    return paged(
      items.map((r) => toItem(r, today)),
      total,
      q,
    );
  },

  /** The three numbers on top of the invoices page. */
  async summary(db: AppDb, actor: CurrentUser): Promise<InvoiceSummary> {
    const today = dateOrNull(todayIn((await companyInfo(db, companyOf(actor))).timeZone))!;
    const [open, late, paid] = await Promise.all([
      db.invoice.aggregate({
        where: { status: { in: UNPAID } },
        _sum: { total: true, amountPaid: true },
        _count: true,
      }),
      db.invoice.aggregate({
        where: { status: { in: UNPAID }, dueDate: { lt: today } },
        _sum: { total: true, amountPaid: true },
      }),
      db.payment.aggregate({
        where: { paidAt: { gte: new Date(Date.now() - 30 * 24 * 3600_000) } },
        _sum: { amount: true },
      }),
    ]);
    const bal = (s: { total: Prisma.Decimal | null; amountPaid: Prisma.Decimal | null }) =>
      n((s.total ?? ZERO).sub(s.amountPaid ?? ZERO));
    return {
      outstanding: bal(open._sum),
      overdue: bal(late._sum),
      collected30: n(paid._sum.amount ?? ZERO),
      openCount: open._count,
    };
  },

  async get(db: AppDb, actor: CurrentUser, id: string): Promise<InvoiceDetail> {
    const info = await companyInfo(db, companyOf(actor));
    return toDetail(await getRow(db, id), todayIn(info.timeZone), info.timeZone, info.address);
  },

  /** The invoice for a completed work order: its lines are copied; one live invoice per work order. */
  async createFromWorkOrder(db: AppDb, actor: CurrentUser, workOrderId: string) {
    const companyId = companyOf(actor);
    const info = await companyInfo(db, companyId);
    const wo = await db.workOrder.findFirst({
      where: { id: workOrderId },
      select: {
        number: true,
        status: true,
        customerId: true,
        lines: {
          where: live,
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { serviceItemId: true, description: true, qty: true, unitPrice: true, taxPercent: true },
        },
      },
    });
    if (!wo) throw new NotFoundError("Work order", workOrderId);
    if (wo.status !== "CLOSED")
      throw new ConflictError(
        wo.status === "COMPLETED"
          ? `${wo.number} is waiting for QA. Close it before it is invoiced.`
          : `${wo.number} must be closed (QA verified) before it is invoiced.`,
      );
    const existing = await db.invoice.findFirst({
      where: { workOrderId, status: { not: "VOID" } },
      select: { number: true },
    });
    if (existing) throw new ConflictError(`${wo.number} already has invoice ${existing.number}.`);
    if (wo.lines.length === 0)
      throw new ConflictError(`${wo.number} has no services or parts to invoice. Add lines first.`);

    const today = todayIn(info.timeZone);
    const due = new Date(`${today}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + DEFAULT_TERMS_DAYS);

    return db.$withTx(async () => {
      const number = await nextNumber(db, "INV");
      const t = computeTotals(wo.lines);
      const inv = await db.invoice.create({
        data: {
          companyId,
          number,
          workOrderId,
          customerId: wo.customerId,
          status: "DRAFT",
          subTotal: t.subTotal,
          tax: t.tax,
          discount: t.discount,
          total: t.total,
          issueDate: dateOrNull(today)!,
          dueDate: due,
        },
        select: { id: true, number: true },
      });
      await db.invoiceLine.createMany({
        data: wo.lines.map((l, i) => ({
          companyId,
          invoiceId: inv.id,
          sortOrder: i + 1,
          serviceItemId: l.serviceItemId,
          description: l.description,
          qty: l.qty,
          unitPrice: l.unitPrice,
          taxPercent: l.taxPercent,
          lineTotal: computeLine(l).lineTotal,
        })),
      });
      return inv;
    });
  },

  async update(db: AppDb, actor: CurrentUser, id: string, input: InvoiceInput): Promise<InvoiceDetail> {
    const r = await db.invoice.findFirst({ where: { id }, select: { number: true, status: true, discount: true } });
    if (!r) throw new NotFoundError("Invoice", id);
    if (r.status === "VOID") throw new ConflictError(`${r.number} is void.`);
    if (r.status !== "DRAFT" && !r.discount.equals(D(input.discount)))
      throw new ConflictError(`${r.number} is issued, so its discount is locked.`);
    await db.$withTx(async () => {
      await db.invoice.update({
        where: { id },
        data: { dueDate: dateOrNull(input.dueDate), notes: nullIfEmpty(input.notes) },
      });
      if (r.status === "DRAFT") await recompute(db, id, input.discount);
    });
    return this.get(db, actor, id);
  },

  /** Draft → Issued: from here the lines and amounts are locked and payments can be recorded. */
  async issue(db: AppDb, actor: CurrentUser, id: string): Promise<InvoiceDetail> {
    const r = await getRow(db, id);
    if (r.status !== "DRAFT") throw new ConflictError(`${r.number} is already issued or void.`);
    if (r.lines.length === 0) throw new ConflictError("Add at least one line before issuing the invoice.");
    const info = await companyInfo(db, companyOf(actor));
    const res = await db.invoice.updateMany({
      where: { id, status: "DRAFT" },
      data: { status: "SENT", issueDate: dateOrNull(todayIn(info.timeZone))! },
    });
    if (res.count === 0) throw new ConflictError("The invoice was changed by someone else. Refresh and try again.");
    return this.get(db, actor, id);
  },

  /** Cancels an invoice that has no money against it; it keeps its number but no longer counts. */
  async void(db: AppDb, actor: CurrentUser, id: string): Promise<InvoiceDetail> {
    const r = await getRow(db, id);
    if (r.status === "VOID") throw new ConflictError(`${r.number} is already void.`);
    if (!r.amountPaid.isZero() || r.status === "PAID" || r.status === "PARTIALLY_PAID")
      throw new ConflictError(`${r.number} has payments. Remove them before voiding.`);
    await db.invoice.update({ where: { id }, data: { status: "VOID" } });
    return this.get(db, actor, id);
  },

  // ---------------------------------------------------------------- lines (drafts only)
  async addLine(db: AppDb, actor: CurrentUser, id: string, input: LineInput) {
    const companyId = companyOf(actor);
    await draftOrThrow(db, id);
    await db.$withTx(async () => {
      const max = await db.invoiceLine.aggregate({ where: { invoiceId: id }, _max: { sortOrder: true } });
      await db.invoiceLine.create({
        data: { companyId, invoiceId: id, sortOrder: (max._max.sortOrder ?? 0) + 1, ...lineData(input) },
      });
      await recompute(db, id);
    });
  },

  async updateLine(db: AppDb, id: string, lineId: string, input: LineInput) {
    await draftOrThrow(db, id);
    await db.$withTx(async () => {
      const res = await db.invoiceLine.updateMany({ where: { id: lineId, invoiceId: id }, data: lineData(input) });
      if (res.count === 0) throw new NotFoundError("Line", lineId);
      await recompute(db, id);
    });
  },

  async removeLine(db: AppDb, id: string, lineId: string) {
    await draftOrThrow(db, id);
    await db.$withTx(async () => {
      const res = await db.invoiceLine.deleteMany({ where: { id: lineId, invoiceId: id } });
      if (res.count === 0) throw new NotFoundError("Line", lineId);
      await recompute(db, id);
    });
  },

  // ---------------------------------------------------------------- payments
  /** Partial payments are fine; paying more than the balance is not. The row is locked so two payments cannot overpay. */
  async addPayment(db: AppDb, actor: CurrentUser, id: string, input: PaymentInput): Promise<InvoiceDetail> {
    const companyId = companyOf(actor);
    const info = await companyInfo(db, companyId);
    await db.$withTx(async () => {
      await lockInvoice(db, id);
      const inv = await db.invoice.findFirst({
        where: { id },
        select: { number: true, status: true, total: true, amountPaid: true },
      });
      if (!inv) throw new NotFoundError("Invoice", id);
      if (inv.status === "DRAFT") throw new ConflictError(`Issue ${inv.number} before recording payments.`);
      if (inv.status === "VOID") throw new ConflictError(`${inv.number} is void.`);
      if (inv.status === "PAID") throw new ConflictError(`${inv.number} is already fully paid.`);
      const balance = inv.total.sub(inv.amountPaid);
      if (D(input.amount).gt(balance)) {
        const msg = `That is more than the balance of ${balance.toFixed(2)}.`;
        throw new BadRequestError(msg, { amount: [msg] });
      }
      await db.payment.create({
        data: {
          companyId,
          invoiceId: id,
          amount: new Prisma.Decimal(input.amount.toFixed(2)),
          method: input.method,
          reference: nullIfEmpty(input.reference),
          paidAt: input.paidAt ? fromCompanyTime(`${input.paidAt}T12:00`, info.timeZone) : new Date(),
        },
      });
      await settle(db, id);
    });
    return this.get(db, actor, id);
  },

  /** Fixes a mistake: the payment is removed and the invoice goes back to Issued / Partially paid. */
  async removePayment(db: AppDb, actor: CurrentUser, id: string, paymentId: string): Promise<InvoiceDetail> {
    await db.$withTx(async () => {
      await lockInvoice(db, id);
      const inv = await db.invoice.findFirst({ where: { id }, select: { number: true, status: true } });
      if (!inv) throw new NotFoundError("Invoice", id);
      if (inv.status === "VOID") throw new ConflictError(`${inv.number} is void.`);
      const p = await db.payment.findFirst({ where: { id: paymentId, invoiceId: id }, select: { id: true } });
      if (!p) throw new NotFoundError("Payment", paymentId);
      await db.payment.delete({ where: { id: paymentId } });
      await settle(db, id);
    });
    return this.get(db, actor, id);
  },

  /** The live (not void) invoice of a work order, for the link on the work order page. */
  async forWorkOrder(db: AppDb, workOrderId: string) {
    return db.invoice.findFirst({
      where: { workOrderId, status: { not: "VOID" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true, status: true },
    });
  },
};
