import "server-only";
import type { Prisma } from "@prisma/client";
import type { AppDb } from "@/lib/db";
import { OPEN_WORK_ORDER_STATUSES } from "@/lib/statuses";

const live = { deletedAt: null };

export const assetSelect = {
  id: true,
  customerId: true,
  addressId: true,
  name: true,
  category: true,
  brand: true,
  model: true,
  serialNo: true,
  installDate: true,
  warrantyEndDate: true,
  status: true,
  createdAt: true,
  customer: { select: { name: true } },
  address: {
    select: { label: true, addressLine: true, deletedAt: true, project: { select: { name: true, deletedAt: true } } },
  },
  workOrders: {
    where: { ...live, status: { in: ["COMPLETED", "CLOSED"] } },
    orderBy: { completedAt: "desc" },
    take: 1,
    select: { completedAt: true },
  },
  _count: { select: { workOrders: { where: live } } },
} satisfies Prisma.AssetSelect;
export type AssetRow = Prisma.AssetGetPayload<{ select: typeof assetSelect }>;

export const assetsRepository = {
  async list(
    db: AppDb,
    where: Prisma.AssetWhereInput,
    orderBy: Prisma.AssetOrderByWithRelationInput[],
    skip: number,
    take: number,
  ) {
    const [items, total] = await Promise.all([
      db.asset.findMany({ where, orderBy, skip, take, select: assetSelect }),
      db.asset.count({ where }),
    ]);
    return { items, total };
  },

  findById(db: AppDb, id: string) {
    return db.asset.findFirst({ where: { id }, select: assetSelect });
  },

  create(db: AppDb, data: Prisma.AssetUncheckedCreateInput) {
    return db.asset.create({ data, select: { id: true } });
  },

  update(db: AppDb, id: string, data: Prisma.AssetUncheckedUpdateInput) {
    return db.asset.update({ where: { id }, data, select: { id: true } });
  },

  softDelete(db: AppDb, id: string) {
    return db.asset.delete({ where: { id } });
  },

  customerExists(db: AppDb, id: string) {
    return db.customer.count({ where: { id } }).then((n) => n > 0);
  },

  addressBelongsTo(db: AppDb, addressId: string, customerId: string) {
    return db.serviceAddress.count({ where: { id: addressId, customerId } }).then((n) => n > 0);
  },

  countOpenWorkOrders(db: AppDb, assetId: string) {
    return db.workOrder.count({ where: { assetId, status: { in: OPEN_WORK_ORDER_STATUSES } } });
  },
};
