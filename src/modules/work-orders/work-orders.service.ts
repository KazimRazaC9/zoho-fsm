import "server-only";
import { Prisma, type WorkOrderStatus } from "@prisma/client";
import { transitionError, isClosed } from "./work-order-status";
import { workOrdersRepository, type DetailRow, type ListRow } from "./work-orders.repository";
import type {
  ChangeStatusInput,
  CreateWorkOrderInput,
  LineInput,
  NoteInput,
  WorkOrderDetail,
  WorkOrderInput,
  WorkOrderListItem,
  WorkOrderListQuery,
} from "./work-orders.schema";
import type { CurrentUser } from "@/lib/auth";
import type { AppDb } from "@/lib/db";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { computeLine, computeTotals } from "@/lib/money";
import { nextNumber } from "@/lib/numbers";
import { paged, type PagedResult } from "@/lib/pagination";
import { OPEN_WORK_ORDER_STATUSES } from "@/lib/statuses";
import { deleteStoredFile, readStoredFile, safeFileName, saveFile } from "@/lib/storage";
import { formatIn, fromCompanyTime } from "@/lib/tz";
import { nullIfEmpty } from "@/lib/validation";
import { checklistsService } from "@/modules/checklists";

const companyOf = (actor: CurrentUser) => {
  if (!actor.companyId) throw new ForbiddenError("This action needs a company account.");
  return actor.companyId;
};

const n = (d: Prisma.Decimal | null) => (d == null ? 0 : Number(d));

function siteText(a: ListRow["address"]) {
  if (!a) return null;
  return a.label ? `${a.label} — ${a.addressLine}` : a.addressLine;
}

function toListItem(w: ListRow, now = new Date()): WorkOrderListItem {
  return {
    id: w.id,
    number: w.number,
    title: w.title,
    status: w.status,
    priority: w.priority,
    customerId: w.customerId,
    customerName: w.customer.name,
    siteLabel: siteText(w.address),
    assetName: w.asset?.name ?? null,
    dueDate: w.dueDate?.toISOString() ?? null,
    overdue: !!w.dueDate && w.dueDate < now && !isClosed(w.status),
    createdAt: w.createdAt.toISOString(),
  };
}

async function company(db: AppDb, actor: CurrentUser) {
  const c = await workOrdersRepository.company(db, companyOf(actor));
  if (!c) throw new NotFoundError("Company");
  return c;
}

async function statusOrThrow(db: AppDb, id: string) {
  const w = await workOrdersRepository.findStatus(db, id);
  if (!w) throw new NotFoundError("Work order", id);
  return w;
}

/** Lines, checklist, notes and files can only change while the work order is open. */
async function openOrThrow(db: AppDb, id: string) {
  const w = await statusOrThrow(db, id);
  if (isClosed(w.status)) {
    throw new ConflictError(
      `${w.number} is ${w.status === "COMPLETED" ? "completed" : "cancelled"}. Reopen it to make changes.`,
    );
  }
  return w;
}

async function assertTargets(db: AppDb, i: { customerId: string; addressId: string; assetId: string }) {
  const ok = await workOrdersRepository.targetsValid(db, i.customerId, i.addressId || null, i.assetId || null);
  if (!ok.customer)
    throw new BadRequestError("Customer was not found.", { customerId: ["Choose an existing customer."] });
  if (!ok.address)
    throw new BadRequestError("That site is not one of this customer's.", {
      addressId: ["Choose one of this customer's sites."],
    });
  if (!ok.asset)
    throw new BadRequestError("That asset is not one of this customer's.", {
      assetId: ["Choose one of this customer's assets."],
    });
}

const detailsData = (i: WorkOrderInput, timeZone: string) => ({
  customerId: i.customerId,
  addressId: i.addressId || null,
  assetId: i.assetId || null,
  title: i.title,
  description: nullIfEmpty(i.description),
  priority: i.priority,
  dueDate: i.dueDate ? fromCompanyTime(i.dueDate, timeZone) : null,
});

const lineData = (i: LineInput) => {
  const { lineTotal } = computeLine(i);
  return {
    serviceItemId: i.serviceItemId || null,
    description: i.description,
    qty: new Prisma.Decimal(i.qty.toFixed(2)),
    unitPrice: new Prisma.Decimal(i.unitPrice.toFixed(2)),
    taxPercent: new Prisma.Decimal(i.taxPercent.toFixed(2)),
    lineTotal,
  };
};

async function toDetail(
  db: AppDb,
  w: DetailRow,
  timeZone: string,
  requireSignature: boolean,
): Promise<WorkOrderDetail> {
  const files = await workOrdersRepository.attachments(db, w.id);
  const names = await workOrdersRepository.userNames(db, [
    ...w.notes.map((x) => x.createdById ?? ""),
    ...files.map((f) => f.createdById ?? ""),
  ]);
  const totals = computeTotals(w.lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, taxPercent: l.taxPercent })));
  const a = w.address;
  return {
    ...toListItem(w),
    description: w.description,
    completedAt: w.completedAt?.toISOString() ?? null,
    dueDateLocal: w.dueDate ? formatIn(w.dueDate, timeZone, "yyyy-MM-dd'T'HH:mm") : "",
    customerPhone: w.customer.phone,
    address: a
      ? {
          id: a.id,
          label: a.label,
          fullAddress: [a.addressLine, a.city, a.state, a.country].filter(Boolean).join(", "),
          latitude: a.latitude == null ? null : Number(a.latitude),
          longitude: a.longitude == null ? null : Number(a.longitude),
        }
      : null,
    assetId: w.assetId,
    request: w.request,
    lines: w.lines.map((l) => ({
      id: l.id,
      serviceItemId: l.serviceItemId,
      description: l.description,
      qty: n(l.qty),
      unitPrice: n(l.unitPrice),
      taxPercent: n(l.taxPercent),
      lineTotal: n(l.lineTotal),
    })),
    totals: { subTotal: n(totals.subTotal), tax: n(totals.tax), total: n(totals.total) },
    checklist: w.checklistItems.map((c) => ({
      id: c.id,
      text: c.text,
      isDone: c.isDone,
      doneBy: c.doneBy?.fullName ?? null,
      doneAt: c.doneAt?.toISOString() ?? null,
    })),
    notes: w.notes.map((x) => ({
      id: x.id,
      text: x.text,
      isInternal: x.isInternal,
      authorId: x.createdById,
      author: x.createdById ? (names.get(x.createdById) ?? null) : null,
      createdAt: x.createdAt.toISOString(),
    })),
    attachments: files.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      contentType: f.contentType,
      sizeBytes: f.sizeBytes,
      kind: f.kind,
      createdAt: f.createdAt.toISOString(),
      author: f.createdById ? (names.get(f.createdById) ?? null) : null,
    })),
    timeline: w.statusChanges.map((s) => ({
      id: s.id,
      fromStatus: s.fromStatus,
      toStatus: s.toStatus,
      reason: s.reason,
      by: s.changedBy?.fullName ?? null,
      at: s.createdAt.toISOString(),
    })),
    requireSignatureOnComplete: requireSignature,
  };
}

export const workOrdersService = {
  async list(db: AppDb, q: WorkOrderListQuery): Promise<PagedResult<WorkOrderListItem>> {
    const has = q.search ? ({ contains: q.search, mode: "insensitive" } as const) : undefined;
    const statusWhere: Prisma.WorkOrderWhereInput =
      q.status === "open"
        ? { status: { in: OPEN_WORK_ORDER_STATUSES } }
        : q.status === "overdue"
          ? { status: { in: OPEN_WORK_ORDER_STATUSES }, dueDate: { lt: new Date() } }
          : q.status
            ? { status: q.status as WorkOrderStatus }
            : {};
    const where: Prisma.WorkOrderWhereInput = {
      ...statusWhere,
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(has ? { OR: [{ number: has }, { title: has }, { customer: { name: has } }, { asset: { name: has } }] } : {}),
    };
    const orderBy: Prisma.WorkOrderOrderByWithRelationInput[] =
      q.sortBy === "dueDate"
        ? [{ dueDate: { sort: q.sortDir, nulls: "last" } }, { createdAt: "desc" }]
        : [{ [q.sortBy]: q.sortDir }];
    const { items, total } = await workOrdersRepository.list(db, where, orderBy, (q.page - 1) * q.pageSize, q.pageSize);
    const now = new Date();
    return paged(
      items.map((w) => toListItem(w, now)),
      total,
      q,
    );
  },

  async get(db: AppDb, actor: CurrentUser, id: string): Promise<WorkOrderDetail> {
    const [w, c] = await Promise.all([workOrdersRepository.findDetail(db, id), company(db, actor)]);
    if (!w) throw new NotFoundError("Work order", id);
    return toDetail(db, w, c.timeZone, c.requireSignatureOnComplete);
  },

  /**
   * New work order (number WO-000123), optionally from a service request and a checklist template.
   * The first timeline entry is "created as New".
   */
  async create(
    db: AppDb,
    actor: CurrentUser,
    input: CreateWorkOrderInput,
    opts: { requestId?: string; lines?: LineInput[] } = {},
  ): Promise<WorkOrderDetail> {
    const companyId = companyOf(actor);
    const c = await company(db, actor);
    await assertTargets(db, input);
    const items = input.checklistTemplateId ? await checklistsService.templateItems(db, input.checklistTemplateId) : [];

    const id = await db.$withTx(async () => {
      const number = await nextNumber(db, "WO");
      const wo = await db.workOrder.create({
        data: {
          companyId,
          number,
          requestId: opts.requestId ?? null,
          status: "NEW",
          ...detailsData(input, c.timeZone),
        },
        select: { id: true },
      });
      await workOrdersRepository.recordStatus(db, {
        companyId,
        workOrderId: wo.id,
        fromStatus: null,
        toStatus: "NEW",
        reason: opts.requestId ? "Created from service request" : null,
        changedById: actor.id,
      });
      if (items.length) {
        await db.workOrderChecklistItem.createMany({
          data: items.map((text, i) => ({ companyId, workOrderId: wo.id, text, sortOrder: i + 1 })),
        });
      }
      for (const [i, l] of (opts.lines ?? []).entries()) {
        await db.workOrderLine.create({ data: { companyId, workOrderId: wo.id, sortOrder: i + 1, ...lineData(l) } });
      }
      return wo.id;
    });
    return this.get(db, actor, id);
  },

  async update(db: AppDb, actor: CurrentUser, id: string, input: WorkOrderInput): Promise<WorkOrderDetail> {
    await openOrThrow(db, id);
    const c = await company(db, actor);
    await assertTargets(db, input);
    await db.workOrder.update({ where: { id }, data: detailsData(input, c.timeZone) });
    return this.get(db, actor, id);
  },

  /** Every status change goes through the state machine and lands on the timeline. */
  async changeStatus(db: AppDb, actor: CurrentUser, id: string, input: ChangeStatusInput): Promise<WorkOrderDetail> {
    const companyId = companyOf(actor);
    const w = await statusOrThrow(db, id);
    const c = await company(db, actor);
    const [openChecklistItems, signatures] = await Promise.all([
      workOrdersRepository.countOpenChecklist(db, id),
      c.requireSignatureOnComplete ? workOrdersRepository.countSignatures(db, id) : Promise.resolve(0),
    ]);
    const error = transitionError(w.status, input.status, {
      role: actor.role,
      reason: input.reason,
      openChecklistItems,
      requireSignature: c.requireSignatureOnComplete,
      hasSignature: signatures > 0,
    });
    if (error) throw new ConflictError(error, { status: [error] });

    await db.$withTx(async () => {
      // Guarded update: if someone else changed the status meanwhile, nothing matches and we stop.
      const res = await db.workOrder.updateMany({
        where: { id, status: w.status },
        data: {
          status: input.status,
          completedAt: input.status === "COMPLETED" ? new Date() : w.status === "COMPLETED" ? null : undefined,
        },
      });
      if (res.count === 0)
        throw new ConflictError("The work order was changed by someone else. Refresh and try again.");
      await workOrdersRepository.recordStatus(db, {
        companyId,
        workOrderId: id,
        fromStatus: w.status,
        toStatus: input.status,
        reason: nullIfEmpty(input.reason),
        changedById: actor.id,
      });
    });
    return this.get(db, actor, id);
  },

  /** Only new or cancelled work orders can be deleted (soft delete). */
  async remove(db: AppDb, id: string): Promise<void> {
    const w = await statusOrThrow(db, id);
    if (w.status !== "NEW" && w.status !== "CANCELLED") {
      throw new ConflictError("Only new or cancelled work orders can be deleted. Cancel it first.");
    }
    await db.workOrder.delete({ where: { id } });
  },

  // ------------------------------------------------------------ lines
  async addLine(db: AppDb, actor: CurrentUser, id: string, input: LineInput) {
    const companyId = companyOf(actor);
    await openOrThrow(db, id);
    const sortOrder = (await workOrdersRepository.maxSort(db, "line", id)) + 1;
    await db.workOrderLine.create({ data: { companyId, workOrderId: id, sortOrder, ...lineData(input) } });
  },

  async updateLine(db: AppDb, id: string, lineId: string, input: LineInput) {
    await openOrThrow(db, id);
    const res = await db.workOrderLine.updateMany({ where: { id: lineId, workOrderId: id }, data: lineData(input) });
    if (res.count === 0) throw new NotFoundError("Line", lineId);
  },

  async removeLine(db: AppDb, id: string, lineId: string) {
    await openOrThrow(db, id);
    const res = await db.workOrderLine.deleteMany({ where: { id: lineId, workOrderId: id } });
    if (res.count === 0) throw new NotFoundError("Line", lineId);
  },

  // ------------------------------------------------------------ notes (allowed on closed jobs too)
  async addNote(db: AppDb, actor: CurrentUser, id: string, input: NoteInput) {
    const companyId = companyOf(actor);
    await statusOrThrow(db, id);
    await db.workOrderNote.create({
      data: { companyId, workOrderId: id, text: input.text, isInternal: input.isInternal },
    });
  },

  /** Authors delete their own notes; Admins any note. */
  async removeNote(db: AppDb, actor: CurrentUser, id: string, noteId: string) {
    const note = await db.workOrderNote.findFirst({
      where: { id: noteId, workOrderId: id },
      select: { createdById: true },
    });
    if (!note) throw new NotFoundError("Note", noteId);
    if (actor.role !== "ADMIN" && note.createdById !== actor.id)
      throw new ForbiddenError("You can only delete your own notes.");
    await db.workOrderNote.delete({ where: { id: noteId } });
  },

  // ------------------------------------------------------------ checklist
  async applyTemplate(db: AppDb, actor: CurrentUser, id: string, templateId: string) {
    const companyId = companyOf(actor);
    await openOrThrow(db, id);
    const items = await checklistsService.templateItems(db, templateId);
    const start = await workOrdersRepository.maxSort(db, "checklist", id);
    await db.workOrderChecklistItem.createMany({
      data: items.map((text, i) => ({ companyId, workOrderId: id, text, sortOrder: start + i + 1 })),
    });
  },

  async addChecklistItem(db: AppDb, actor: CurrentUser, id: string, text: string) {
    const companyId = companyOf(actor);
    await openOrThrow(db, id);
    const sortOrder = (await workOrdersRepository.maxSort(db, "checklist", id)) + 1;
    await db.workOrderChecklistItem.create({ data: { companyId, workOrderId: id, text, sortOrder } });
  },

  async setChecklistItem(db: AppDb, actor: CurrentUser, id: string, itemId: string, isDone: boolean) {
    await openOrThrow(db, id);
    const res = await db.workOrderChecklistItem.updateMany({
      where: { id: itemId, workOrderId: id },
      data: { isDone, doneById: isDone ? actor.id : null, doneAt: isDone ? new Date() : null },
    });
    if (res.count === 0) throw new NotFoundError("Checklist item", itemId);
  },

  async removeChecklistItem(db: AppDb, id: string, itemId: string) {
    await openOrThrow(db, id);
    const res = await db.workOrderChecklistItem.deleteMany({ where: { id: itemId, workOrderId: id } });
    if (res.count === 0) throw new NotFoundError("Checklist item", itemId);
  },

  // ------------------------------------------------------------ attachments
  async addAttachment(db: AppDb, actor: CurrentUser, id: string, file: File, kind?: "SIGNATURE") {
    const companyId = companyOf(actor);
    await openOrThrow(db, id);
    const stored = await saveFile(companyId, file);
    try {
      return await db.attachment.create({
        data: {
          companyId,
          entityType: "WORK_ORDER",
          entityId: id,
          fileName: safeFileName(file.name),
          storageKey: stored.key,
          contentType: stored.contentType,
          sizeBytes: stored.size,
          kind: kind ?? (stored.contentType.startsWith("image/") ? "PHOTO" : "DOCUMENT"),
        },
        select: { id: true, fileName: true },
      });
    } catch (e) {
      await deleteStoredFile(stored.key);
      throw e;
    }
  },

  async removeAttachment(db: AppDb, id: string, attachmentId: string) {
    await openOrThrow(db, id);
    const a = await db.attachment.findFirst({ where: { id: attachmentId, entityType: "WORK_ORDER", entityId: id } });
    if (!a) throw new NotFoundError("Attachment", attachmentId);
    // Soft delete keeps the file for audit; a clean-up job (Phase 7) can purge old ones.
    await db.attachment.delete({ where: { id: attachmentId } });
  },

  /** The file of an attachment in this tenant (RLS + tenant scope make other companies' files invisible). */
  async readAttachment(db: AppDb, attachmentId: string) {
    const a = await db.attachment.findFirst({ where: { id: attachmentId } });
    if (!a) throw new NotFoundError("Attachment", attachmentId);
    return { meta: a, data: await readStoredFile(a.storageKey) };
  },
};
