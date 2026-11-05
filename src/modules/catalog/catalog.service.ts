import "server-only";
import { Prisma } from "@prisma/client";
import { catalogRepository, type ItemRow } from "./catalog.repository";
import {
  LOW_STOCK_THRESHOLD,
  type ServiceItemDto,
  type ServiceItemInput,
  type ServiceItemListQuery,
} from "./catalog.schema";
import type { CurrentUser } from "@/lib/auth";
import type { AppDb } from "@/lib/db";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { paged, type PagedResult } from "@/lib/pagination";
import { nullIfEmpty } from "@/lib/validation";

const companyOf = (actor: CurrentUser) => {
  if (!actor.companyId) throw new ForbiddenError("This action needs a company account.");
  return actor.companyId;
};

export function toItemDto(i: ItemRow): ServiceItemDto {
  const stock = i.stockQty == null ? null : Number(i.stockQty);
  return {
    id: i.id,
    name: i.name,
    type: i.type,
    sku: i.sku,
    unitPrice: Number(i.unitPrice),
    taxPercent: Number(i.taxPercent),
    stockQty: stock,
    lowStock: i.type === "PART" && stock != null && stock <= LOW_STOCK_THRESHOLD,
    isActive: i.isActive,
    createdAt: i.createdAt.toISOString(),
  };
}

const itemData = (i: ServiceItemInput) => ({
  name: i.name,
  type: i.type,
  sku: nullIfEmpty(i.sku),
  unitPrice: new Prisma.Decimal(i.unitPrice.toFixed(2)),
  taxPercent: new Prisma.Decimal(i.taxPercent.toFixed(2)),
  // Only parts carry stock.
  stockQty: i.type === "PART" && i.stockQty != null ? new Prisma.Decimal(i.stockQty.toFixed(2)) : null,
});

async function getOrThrow(db: AppDb, id: string) {
  const i = await catalogRepository.findById(db, id);
  if (!i) throw new NotFoundError("Catalog item", id);
  return i;
}

/** SKUs are unique per company, ignoring case. */
async function assertSkuFree(db: AppDb, sku: string, excludingId?: string) {
  const s = nullIfEmpty(sku);
  if (s && (await catalogRepository.findBySku(db, s, excludingId))) {
    throw new ConflictError("Another item already uses this SKU.", { sku: ["SKU is already in use."] });
  }
}

export const catalogService = {
  async list(db: AppDb, q: ServiceItemListQuery): Promise<PagedResult<ServiceItemDto>> {
    const has = q.search ? ({ contains: q.search, mode: "insensitive" } as const) : undefined;
    const where: Prisma.ServiceItemWhereInput = {
      ...(q.type ? { type: q.type } : {}),
      ...(q.status === "active" ? { isActive: true } : q.status === "inactive" ? { isActive: false } : {}),
      ...(q.stock === "low" ? { type: "PART", stockQty: { lte: LOW_STOCK_THRESHOLD } } : {}),
      ...(has ? { OR: [{ name: has }, { sku: has }] } : {}),
    };
    const orderBy: Prisma.ServiceItemOrderByWithRelationInput[] =
      q.sortBy === "stockQty"
        ? [{ stockQty: { sort: q.sortDir, nulls: "last" } }, { name: "asc" }]
        : [{ [q.sortBy]: q.sortDir }];
    const { items, total } = await catalogRepository.list(db, where, orderBy, (q.page - 1) * q.pageSize, q.pageSize);
    return paged(items.map(toItemDto), total, q);
  },

  async get(db: AppDb, id: string): Promise<ServiceItemDto> {
    return toItemDto(await getOrThrow(db, id));
  },

  /** Active items for line-item pickers (estimates, work orders, invoices). */
  async options(db: AppDb): Promise<ServiceItemDto[]> {
    const { items } = await catalogRepository.list(db, { isActive: true }, [{ type: "asc" }, { name: "asc" }], 0, 1000);
    return items.map(toItemDto);
  },

  async create(db: AppDb, actor: CurrentUser, input: ServiceItemInput): Promise<ServiceItemDto> {
    const companyId = companyOf(actor);
    await assertSkuFree(db, input.sku);
    return toItemDto(await catalogRepository.create(db, { companyId, ...itemData(input) }));
  },

  async update(db: AppDb, id: string, input: ServiceItemInput): Promise<ServiceItemDto> {
    await getOrThrow(db, id);
    await assertSkuFree(db, input.sku, id);
    return toItemDto(await catalogRepository.update(db, id, itemData(input)));
  },

  /** Inactive items stay on old documents but are hidden from pickers. */
  async setActive(db: AppDb, id: string, isActive: boolean): Promise<ServiceItemDto> {
    await getOrThrow(db, id);
    return toItemDto(await catalogRepository.update(db, id, { isActive }));
  },

  /** Receive (+) or write off (−) stock of a tracked part. */
  async adjustStock(db: AppDb, id: string, delta: number): Promise<ServiceItemDto> {
    const item = await getOrThrow(db, id);
    if (item.type !== "PART") throw new BadRequestError("Only parts have stock.");
    if (item.stockQty == null)
      throw new BadRequestError("Stock is not tracked for this part. Edit it and set a quantity first.");
    const changed = await catalogRepository.adjustStock(db, id, new Prisma.Decimal(delta.toFixed(2)));
    if (changed === 0) {
      const now = await getOrThrow(db, id);
      throw new ConflictError(`Only ${Number(now.stockQty ?? 0)} in stock; cannot remove ${Math.abs(delta)}.`, {
        delta: ["Not enough stock."],
      });
    }
    return toItemDto(await getOrThrow(db, id));
  },

  /** Soft delete: past documents keep their own copy of name and price. */
  async remove(db: AppDb, id: string): Promise<void> {
    await getOrThrow(db, id);
    await catalogRepository.softDelete(db, id);
  },
};
