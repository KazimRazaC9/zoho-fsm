import "server-only";
import type { Prisma, WorkOrderStatus } from "@prisma/client";
import type { AppDb } from "@/lib/db";

const live = { deletedAt: null };

export const listSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  priority: true,
  customerId: true,
  dueDate: true,
  createdAt: true,
  customer: { select: { name: true, phone: true } },
  address: {
    select: {
      id: true,
      label: true,
      addressLine: true,
      city: true,
      state: true,
      country: true,
      latitude: true,
      longitude: true,
    },
  },
  asset: { select: { id: true, name: true } },
} satisfies Prisma.WorkOrderSelect;
export type ListRow = Prisma.WorkOrderGetPayload<{ select: typeof listSelect }>;

export const detailSelect = {
  ...listSelect,
  description: true,
  completedAt: true,
  assetId: true,
  request: { select: { id: true, number: true } },
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
  checklistItems: {
    where: live,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, text: true, isDone: true, doneAt: true, doneBy: { select: { fullName: true } } },
  },
  notes: {
    where: live,
    orderBy: { createdAt: "desc" },
    select: { id: true, text: true, isInternal: true, createdById: true, createdAt: true },
  },
  statusChanges: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      reason: true,
      createdAt: true,
      changedBy: { select: { fullName: true } },
    },
  },
} satisfies Prisma.WorkOrderSelect;
export type DetailRow = Prisma.WorkOrderGetPayload<{ select: typeof detailSelect }>;

export const workOrdersRepository = {
  async list(
    db: AppDb,
    where: Prisma.WorkOrderWhereInput,
    orderBy: Prisma.WorkOrderOrderByWithRelationInput[],
    skip: number,
    take: number,
  ) {
    const [items, total] = await Promise.all([
      db.workOrder.findMany({ where, orderBy, skip, take, select: listSelect }),
      db.workOrder.count({ where }),
    ]);
    return { items, total };
  },

  findDetail(db: AppDb, id: string) {
    return db.workOrder.findFirst({ where: { id }, select: detailSelect });
  },

  findStatus(db: AppDb, id: string) {
    return db.workOrder.findFirst({ where: { id }, select: { id: true, status: true, number: true } });
  },

  attachments(db: AppDb, workOrderId: string) {
    return db.attachment.findMany({
      where: { entityType: "WORK_ORDER", entityId: workOrderId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        contentType: true,
        sizeBytes: true,
        kind: true,
        createdAt: true,
        createdById: true,
      },
    });
  },

  /** Display names for user ids (notes and attachments store only the id). */
  async userNames(db: AppDb, ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map<string, string>();
    const rows = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, fullName: true } });
    return new Map(rows.map((r) => [r.id, r.fullName]));
  },

  company(db: AppDb, companyId: string) {
    return db.company.findFirst({
      where: { id: companyId },
      select: { timeZone: true, requireSignatureOnComplete: true },
    });
  },

  /** Customer / site / asset must exist in this company and belong together. */
  async targetsValid(db: AppDb, customerId: string, addressId: string | null, assetId: string | null) {
    const [c, a, s] = await Promise.all([
      db.customer.count({ where: { id: customerId } }),
      addressId ? db.serviceAddress.count({ where: { id: addressId, customerId } }) : 1,
      assetId ? db.asset.count({ where: { id: assetId, customerId } }) : 1,
    ]);
    return { customer: c > 0, address: a > 0, asset: s > 0 };
  },

  recordStatus(
    db: AppDb,
    data: {
      companyId: string;
      workOrderId: string;
      fromStatus: WorkOrderStatus | null;
      toStatus: WorkOrderStatus;
      reason: string | null;
      changedById: string;
    },
  ) {
    return db.workOrderStatusChange.create({ data });
  },

  countOpenChecklist(db: AppDb, workOrderId: string) {
    return db.workOrderChecklistItem.count({ where: { workOrderId, isDone: false } });
  },

  countSignatures(db: AppDb, workOrderId: string) {
    return db.attachment.count({ where: { entityType: "WORK_ORDER", entityId: workOrderId, kind: "SIGNATURE" } });
  },

  maxSort(db: AppDb, model: "line" | "checklist", workOrderId: string) {
    const q =
      model === "line"
        ? db.workOrderLine.aggregate({ where: { workOrderId }, _max: { sortOrder: true } })
        : db.workOrderChecklistItem.aggregate({ where: { workOrderId }, _max: { sortOrder: true } });
    return q.then((r) => r._max.sortOrder ?? 0);
  },
};
