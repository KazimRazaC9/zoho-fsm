import "server-only";
import type { Prisma } from "@prisma/client";
import type { ConvertRequestInput, RequestDto, RequestInput, RequestListQuery } from "./requests.schema";
import type { CurrentUser } from "@/lib/auth";
import type { AppDb } from "@/lib/db";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { nextNumber } from "@/lib/numbers";
import { paged, type PagedResult } from "@/lib/pagination";
import { formatIn, fromCompanyTime } from "@/lib/tz";
import { nullIfEmpty } from "@/lib/validation";
import { workOrdersService } from "@/modules/work-orders";

const select = {
  id: true,
  number: true,
  title: true,
  description: true,
  customerId: true,
  addressId: true,
  assetId: true,
  priority: true,
  source: true,
  category: true,
  zohoTicket: true,
  contactName: true,
  contactPhone: true,
  contactEmail: true,
  preferredAt: true,
  status: true,
  createdAt: true,
  customer: { select: { name: true } },
  address: { select: { label: true, addressLine: true } },
  asset: { select: { name: true } },
  workOrders: {
    where: { deletedAt: null },
    take: 1,
    orderBy: { createdAt: "desc" },
    select: { id: true, number: true },
  },
} satisfies Prisma.ServiceRequestSelect;
type Row = Prisma.ServiceRequestGetPayload<{ select: typeof select }>;

const toDto = (r: Row, timeZone: string): RequestDto => ({
  id: r.id,
  number: r.number,
  title: r.title,
  description: r.description,
  customerId: r.customerId,
  customerName: r.customer.name,
  addressId: r.addressId,
  siteLabel: r.address
    ? r.address.label
      ? `${r.address.label} — ${r.address.addressLine}`
      : r.address.addressLine
    : null,
  assetId: r.assetId,
  assetName: r.asset?.name ?? null,
  priority: r.priority,
  source: r.source,
  category: r.category,
  zohoTicket: r.zohoTicket,
  contactName: r.contactName,
  contactPhone: r.contactPhone,
  contactEmail: r.contactEmail,
  preferredAt: r.preferredAt?.toISOString() ?? null,
  preferredAtLocal: r.preferredAt ? formatIn(r.preferredAt, timeZone, "yyyy-MM-dd'T'HH:mm") : "",
  status: r.status,
  createdAt: r.createdAt.toISOString(),
  workOrder: r.workOrders[0] ?? null,
});

const companyOf = (actor: CurrentUser) => {
  if (!actor.companyId) throw new ForbiddenError("This action needs a company account.");
  return actor.companyId;
};

async function getOrThrow(db: AppDb, id: string) {
  const r = await db.serviceRequest.findFirst({ where: { id }, select });
  if (!r) throw new NotFoundError("Service request", id);
  return r;
}

async function assertTargets(db: AppDb, i: RequestInput) {
  const [c, a, s] = await Promise.all([
    db.customer.count({ where: { id: i.customerId } }),
    i.addressId ? db.serviceAddress.count({ where: { id: i.addressId, customerId: i.customerId } }) : 1,
    i.assetId ? db.asset.count({ where: { id: i.assetId, customerId: i.customerId } }) : 1,
  ]);
  if (!c) throw new BadRequestError("Customer was not found.", { customerId: ["Choose an existing customer."] });
  if (!a)
    throw new BadRequestError("That site is not one of this customer's.", {
      addressId: ["Choose one of this customer's sites."],
    });
  if (!s)
    throw new BadRequestError("That asset is not one of this customer's.", {
      assetId: ["Choose one of this customer's assets."],
    });
}

const data = (i: RequestInput, timeZone: string) => ({
  customerId: i.customerId,
  addressId: i.addressId || null,
  assetId: i.assetId || null,
  title: i.title,
  description: nullIfEmpty(i.description),
  priority: i.priority,
  source: i.source,
  category: i.category || null,
  zohoTicket: nullIfEmpty(i.zohoTicket),
  contactName: nullIfEmpty(i.contactName),
  contactPhone: nullIfEmpty(i.contactPhone),
  contactEmail: nullIfEmpty(i.contactEmail),
  preferredAt: i.preferredAt ? fromCompanyTime(i.preferredAt, timeZone) : null,
});

const zoneOf = async (db: AppDb, companyId: string) =>
  (await db.company.findFirst({ where: { id: companyId }, select: { timeZone: true } }))?.timeZone ?? "UTC";

const OPEN = ["NEW", "ESTIMATED"] as const;

export const requestsService = {
  async list(db: AppDb, actor: CurrentUser, q: RequestListQuery): Promise<PagedResult<RequestDto>> {
    const has = q.search ? ({ contains: q.search, mode: "insensitive" } as const) : undefined;
    const where: Prisma.ServiceRequestWhereInput = {
      ...(q.status === "open" ? { status: { in: [...OPEN] } } : q.status === "all" ? {} : { status: q.status }),
      ...(q.source ? { source: q.source } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(has ? { OR: [{ number: has }, { title: has }, { zohoTicket: has }, { customer: { name: has } }] } : {}),
    };
    const tz = await zoneOf(db, companyOf(actor));
    const skip = (q.page - 1) * q.pageSize;
    const [items, total] = await Promise.all([
      // Urgent first, then oldest first: the order a dispatcher works the queue in.
      db.serviceRequest.findMany({
        where,
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        skip,
        take: q.pageSize,
        select,
      }),
      db.serviceRequest.count({ where }),
    ]);
    return paged(
      items.map((r) => toDto(r, tz)),
      total,
      q,
    );
  },

  async get(db: AppDb, actor: CurrentUser, id: string): Promise<RequestDto> {
    return toDto(await getOrThrow(db, id), await zoneOf(db, companyOf(actor)));
  },

  async create(db: AppDb, actor: CurrentUser, input: RequestInput): Promise<RequestDto> {
    const companyId = companyOf(actor);
    await assertTargets(db, input);
    const tz = await zoneOf(db, companyId);
    const id = await db.$withTx(async () => {
      const number = await nextNumber(db, "SR");
      const r = await db.serviceRequest.create({
        data: { companyId, number, ...data(input, tz) },
        select: { id: true },
      });
      return r.id;
    });
    return toDto(await getOrThrow(db, id), tz);
  },

  async update(db: AppDb, actor: CurrentUser, id: string, input: RequestInput): Promise<RequestDto> {
    const r = await getOrThrow(db, id);
    if (!(OPEN as readonly string[]).includes(r.status))
      throw new ConflictError(`${r.number} is closed and cannot be edited.`);
    await assertTargets(db, input);
    const tz = await zoneOf(db, companyOf(actor));
    await db.serviceRequest.update({ where: { id }, data: data(input, tz) });
    return toDto(await getOrThrow(db, id), tz);
  },

  async cancel(db: AppDb, actor: CurrentUser, id: string): Promise<RequestDto> {
    const r = await getOrThrow(db, id);
    if (!(OPEN as readonly string[]).includes(r.status))
      throw new ConflictError(`${r.number} is already ${r.status.toLowerCase()}.`);
    await db.serviceRequest.update({ where: { id }, data: { status: "CANCELLED" } });
    return toDto(await getOrThrow(db, id), await zoneOf(db, companyOf(actor)));
  },

  /**
   * Request → work order, in one transaction: the work order copies customer, site, asset, title,
   * description and priority, links back to the request, and the request becomes Converted.
   */
  async convert(db: AppDb, actor: CurrentUser, id: string, input: ConvertRequestInput) {
    const r = await getOrThrow(db, id);
    if (!(OPEN as readonly string[]).includes(r.status)) {
      throw new ConflictError(
        r.status === "CONVERTED"
          ? `${r.number} was already converted to ${r.workOrders[0]?.number ?? "a work order"}.`
          : `${r.number} is cancelled.`,
      );
    }
    return db.$withTx(async () => {
      // Claim the request first so two dispatchers cannot convert it twice.
      const claimed = await db.serviceRequest.updateMany({
        where: { id, status: { in: [...OPEN] } },
        data: { status: "CONVERTED" },
      });
      if (claimed.count === 0) throw new ConflictError(`${r.number} was just converted by someone else.`);
      const wo = await workOrdersService.create(
        db,
        actor,
        {
          customerId: r.customerId,
          addressId: r.addressId ?? "",
          assetId: r.assetId ?? "",
          title: r.title,
          description: r.description ?? "",
          zohoTicket: r.zohoTicket ?? "",
          purchaseOrder: "",
          priority: r.priority,
          dueDate: input.dueDate,
          checklistTemplateId: input.checklistTemplateId,
        },
        { requestId: id },
      );
      return { id: wo.id, number: wo.number };
    });
  },
};
