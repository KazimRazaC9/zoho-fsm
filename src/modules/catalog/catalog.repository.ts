import "server-only";
import type { Prisma } from "@prisma/client";
import type { AppDb } from "@/lib/db";

export const itemSelect = {
  id: true,
  name: true,
  type: true,
  sku: true,
  unitPrice: true,
  taxPercent: true,
  stockQty: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.ServiceItemSelect;
export type ItemRow = Prisma.ServiceItemGetPayload<{ select: typeof itemSelect }>;

export const catalogRepository = {
  async list(
    db: AppDb,
    where: Prisma.ServiceItemWhereInput,
    orderBy: Prisma.ServiceItemOrderByWithRelationInput[],
    skip: number,
    take: number,
  ) {
    const [items, total] = await Promise.all([
      db.serviceItem.findMany({ where, orderBy, skip, take, select: itemSelect }),
      db.serviceItem.count({ where }),
    ]);
    return { items, total };
  },

  findById(db: AppDb, id: string) {
    return db.serviceItem.findFirst({ where: { id }, select: itemSelect });
  },

  findBySku(db: AppDb, sku: string, excludingId?: string) {
    return db.serviceItem.findFirst({
      where: { sku: { equals: sku, mode: "insensitive" }, ...(excludingId ? { id: { not: excludingId } } : {}) },
      select: { id: true },
    });
  },

  create(db: AppDb, data: Prisma.ServiceItemUncheckedCreateInput) {
    return db.serviceItem.create({ data, select: itemSelect });
  },

  update(db: AppDb, id: string, data: Prisma.ServiceItemUncheckedUpdateInput) {
    return db.serviceItem.update({ where: { id }, data, select: itemSelect });
  },

  /**
   * Atomic stock change. A decrease only applies while enough stock is left, so two people
   * taking the last unit at once cannot push it below zero. Returns rows changed (0 or 1).
   */
  async adjustStock(db: AppDb, id: string, delta: Prisma.Decimal) {
    const res = await db.serviceItem.updateMany({
      where: { id, type: "PART", stockQty: delta.isNegative() ? { gte: delta.negated() } : { not: null } },
      data: { stockQty: { increment: delta } },
    });
    return res.count;
  },

  softDelete(db: AppDb, id: string) {
    return db.serviceItem.delete({ where: { id } });
  },
};
