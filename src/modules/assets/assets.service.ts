import "server-only";
import type { Prisma } from "@prisma/client";
import { assetsRepository, type AssetRow } from "./assets.repository";
import {
  WARRANTY_EXPIRING_DAYS,
  type AssetDto,
  type AssetInput,
  type AssetListQuery,
  type WarrantyState,
} from "./assets.schema";
import type { CurrentUser } from "@/lib/auth";
import type { AppDb } from "@/lib/db";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { paged, type PagedResult } from "@/lib/pagination";
import { todayIn } from "@/lib/tz";
import { dateOnly, dateOrNull, nullIfEmpty } from "@/lib/validation";
import { workHistory, type WorkHistoryItem } from "@/lib/work-history";

const companyOf = (actor: CurrentUser) => {
  if (!actor.companyId) throw new ForbiddenError("This action needs a company account.");
  return actor.companyId;
};

/** "YYYY-MM-DD" + n days. */
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Warranty state of an end date on `today` (both "YYYY-MM-DD" in the company's zone). */
export function warrantyState(warrantyEndDate: string | null, today: string): WarrantyState {
  if (!warrantyEndDate) return "none";
  if (warrantyEndDate < today) return "expired";
  if (warrantyEndDate <= addDays(today, WARRANTY_EXPIRING_DAYS)) return "expiring";
  return "active";
}

/** Prisma filter for a warranty state ("active" = still covered on `today`, expiring included). */
function warrantyWhere(state: WarrantyState, today: string): Prisma.AssetWhereInput {
  const t = dateOrNull(today)!;
  switch (state) {
    case "none":
      return { warrantyEndDate: null };
    case "expired":
      return { warrantyEndDate: { lt: t } };
    case "expiring":
      return { warrantyEndDate: { gte: t, lte: dateOrNull(addDays(today, WARRANTY_EXPIRING_DAYS))! } };
    case "active":
      return { warrantyEndDate: { gte: t } };
  }
}

function toDto(a: AssetRow, today: string): AssetDto {
  const end = dateOnly(a.warrantyEndDate);
  const site = a.address && !a.address.deletedAt ? a.address : null;
  return {
    id: a.id,
    customerId: a.customerId,
    customerName: a.customer.name,
    addressId: site ? a.addressId : null,
    siteLabel: site
      ? [
          site.project && !site.project.deletedAt ? site.project.name : null,
          site.label ? `${site.label} — ${site.addressLine}` : site.addressLine,
        ]
          .filter(Boolean)
          .join(" › ")
      : null,
    name: a.name,
    category: a.category,
    brand: a.brand,
    model: a.model,
    serialNo: a.serialNo,
    installDate: dateOnly(a.installDate),
    warrantyEndDate: end,
    warranty: warrantyState(end, today),
    status: a.status,
    lastServiceAt: a.workOrders[0]?.completedAt?.toISOString() ?? null,
    workOrderCount: a._count.workOrders,
    createdAt: a.createdAt.toISOString(),
  };
}

const assetData = (i: AssetInput) => ({
  customerId: i.customerId,
  addressId: i.addressId || null,
  name: i.name,
  category: nullIfEmpty(i.category),
  brand: nullIfEmpty(i.brand),
  model: nullIfEmpty(i.model),
  serialNo: nullIfEmpty(i.serialNo),
  installDate: dateOrNull(i.installDate),
  warrantyEndDate: dateOrNull(i.warrantyEndDate),
  status: i.status,
});

async function getOrThrow(db: AppDb, id: string) {
  const a = await assetsRepository.findById(db, id);
  if (!a) throw new NotFoundError("Asset", id);
  return a;
}

/** The customer must exist in this company and the site (if any) must be one of theirs. */
async function assertOwnership(db: AppDb, i: AssetInput) {
  if (!(await assetsRepository.customerExists(db, i.customerId))) {
    throw new BadRequestError("Customer was not found.", { customerId: ["Choose an existing customer."] });
  }
  if (i.addressId && !(await assetsRepository.addressBelongsTo(db, i.addressId, i.customerId))) {
    throw new BadRequestError("That address does not belong to this customer.", {
      addressId: ["Choose one of this customer's addresses."],
    });
  }
}

/** `timeZone` is the company's IANA zone: it decides what "today" is for warranty states. */
export const assetsService = {
  async list(db: AppDb, q: AssetListQuery, timeZone: string): Promise<PagedResult<AssetDto>> {
    const today = todayIn(timeZone);
    const has = q.search ? ({ contains: q.search, mode: "insensitive" } as const) : undefined;
    const where: Prisma.AssetWhereInput = {
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.warranty ? warrantyWhere(q.warranty, today) : {}),
      ...(has
        ? {
            OR: [
              { name: has },
              { serialNo: has },
              { brand: has },
              { model: has },
              { category: has },
              { customer: { name: has } },
            ],
          }
        : {}),
    };
    // Nulls last so "no warranty" assets do not crowd the top of a warranty sort.
    const orderBy: Prisma.AssetOrderByWithRelationInput[] =
      q.sortBy === "warrantyEndDate"
        ? [{ warrantyEndDate: { sort: q.sortDir, nulls: "last" } }, { name: "asc" }]
        : [{ [q.sortBy]: q.sortDir }];
    const { items, total } = await assetsRepository.list(db, where, orderBy, (q.page - 1) * q.pageSize, q.pageSize);
    return paged(
      items.map((a) => toDto(a, today)),
      total,
      q,
    );
  },

  async get(db: AppDb, id: string, timeZone: string): Promise<AssetDto> {
    return toDto(await getOrThrow(db, id), todayIn(timeZone));
  },

  /** Service history: every work order raised against this asset, newest first. */
  async history(db: AppDb, id: string): Promise<WorkHistoryItem[]> {
    await getOrThrow(db, id);
    return workHistory(db, { assetId: id });
  },

  async create(db: AppDb, actor: CurrentUser, input: AssetInput, timeZone: string): Promise<AssetDto> {
    const companyId = companyOf(actor);
    await assertOwnership(db, input);
    const { id } = await assetsRepository.create(db, { companyId, ...assetData(input) });
    return toDto(await getOrThrow(db, id), todayIn(timeZone));
  },

  async update(db: AppDb, id: string, input: AssetInput, timeZone: string): Promise<AssetDto> {
    await getOrThrow(db, id);
    await assertOwnership(db, input);
    await assetsRepository.update(db, id, assetData(input));
    return toDto(await getOrThrow(db, id), todayIn(timeZone));
  },

  /**
   * Re-assigns an asset to another site of the SAME customer (or to no site). Its project follows the
   * site, so this is also how an asset moves between projects.
   */
  async moveToSite(db: AppDb, id: string, addressId: string | null): Promise<void> {
    const a = await getOrThrow(db, id);
    if (addressId && !(await assetsRepository.addressBelongsTo(db, addressId, a.customerId))) {
      throw new BadRequestError("That site does not belong to this customer.", {
        addressId: ["Choose one of this customer's sites."],
      });
    }
    await assetsRepository.update(db, id, { addressId });
  },

  async remove(db: AppDb, id: string): Promise<void> {
    const a = await getOrThrow(db, id);
    const open = await assetsRepository.countOpenWorkOrders(db, id);
    if (open > 0) {
      throw new ConflictError(
        `${a.name} has ${open} open work order${open === 1 ? "" : "s"}. Mark it Retired instead.`,
      );
    }
    await assetsRepository.softDelete(db, id);
  },
};
