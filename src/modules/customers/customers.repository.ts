import "server-only";
import type { Prisma } from "@prisma/client";
import type { AppDb } from "@/lib/db";
import { OPEN_WORK_ORDER_STATUSES } from "@/lib/statuses";

const live = { deletedAt: null };

export const addressSelect = {
  id: true,
  projectId: true,
  project: { select: { name: true, deletedAt: true } },
  label: true,
  addressLine: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  latitude: true,
  longitude: true,
} satisfies Prisma.ServiceAddressSelect;
export type AddressRow = Prisma.ServiceAddressGetPayload<{ select: typeof addressSelect }>;

// The tenant extension filters soft-deleted rows only at the top level of a query, so every
// nested relation below says `deletedAt: null` itself (RLS still keeps them inside the tenant).
export const customerListSelect = {
  id: true,
  type: true,
  name: true,
  email: true,
  phone: true,
  createdAt: true,
  projects: { where: live, orderBy: { name: "asc" }, select: { name: true } },
  addresses: { where: live, orderBy: { createdAt: "asc" }, take: 1, select: addressSelect },
  _count: {
    select: {
      addresses: { where: live },
      assets: { where: live },
      workOrders: { where: { ...live, status: { in: OPEN_WORK_ORDER_STATUSES } } },
    },
  },
} satisfies Prisma.CustomerSelect;
export type CustomerListRow = Prisma.CustomerGetPayload<{ select: typeof customerListSelect }>;

export const customerSelect = {
  id: true,
  type: true,
  name: true,
  email: true,
  phone: true,
  notes: true,
  createdAt: true,
  projects: {
    where: live,
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true, _count: { select: { addresses: { where: live } } } },
  },
  addresses: { where: live, orderBy: { createdAt: "asc" }, select: addressSelect },
} satisfies Prisma.CustomerSelect;
export type CustomerRow = Prisma.CustomerGetPayload<{ select: typeof customerSelect }>;

export const customersRepository = {
  async list(
    db: AppDb,
    where: Prisma.CustomerWhereInput,
    orderBy: Prisma.CustomerOrderByWithRelationInput,
    skip: number,
    take: number,
  ) {
    const [items, total] = await Promise.all([
      db.customer.findMany({ where, orderBy, skip, take, select: customerListSelect }),
      db.customer.count({ where }),
    ]);
    return { items, total };
  },

  findById(db: AppDb, id: string) {
    return db.customer.findFirst({ where: { id }, select: customerSelect });
  },

  options(db: AppDb, where: Prisma.CustomerWhereInput, take: number) {
    return db.customer.findMany({
      where,
      orderBy: { name: "asc" },
      take,
      select: {
        id: true,
        name: true,
        addresses: {
          where: live,
          orderBy: [{ project: { name: "asc" } }, { createdAt: "asc" }],
          select: addressSelect,
        },
        assets: {
          where: { ...live, status: { not: "RETIRED" } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, addressId: true },
        },
      },
    });
  },

  create(db: AppDb, data: Prisma.CustomerUncheckedCreateInput) {
    return db.customer.create({ data, select: { id: true } });
  },

  update(db: AppDb, id: string, data: Prisma.CustomerUncheckedUpdateInput) {
    return db.customer.update({ where: { id }, data, select: { id: true } });
  },

  softDelete(db: AppDb, id: string) {
    return db.customer.delete({ where: { id } });
  },

  findAddress(db: AppDb, customerId: string, id: string) {
    return db.serviceAddress.findFirst({ where: { id, customerId }, select: addressSelect });
  },

  countAddresses(db: AppDb, customerId: string) {
    return db.serviceAddress.count({ where: { customerId } });
  },

  createAddress(db: AppDb, data: Prisma.ServiceAddressUncheckedCreateInput) {
    return db.serviceAddress.create({ data, select: addressSelect });
  },

  updateAddress(db: AppDb, id: string, data: Prisma.ServiceAddressUncheckedUpdateInput) {
    return db.serviceAddress.update({ where: { id }, data, select: addressSelect });
  },

  softDeleteAddress(db: AppDb, id: string) {
    return db.serviceAddress.delete({ where: { id } });
  },

  /** Removing a site keeps its assets with the customer, just without a site. */
  detachAssetsFromAddress(db: AppDb, addressId: string) {
    return db.asset.updateMany({ where: { addressId }, data: { addressId: null } });
  },

  async softDeleteChildren(db: AppDb, customerId: string) {
    await db.asset.deleteMany({ where: { customerId } });
    await db.serviceAddress.deleteMany({ where: { customerId } });
    await db.project.deleteMany({ where: { customerId } });
  },

  // ---------------------------------------------------------------- projects
  findProject(db: AppDb, customerId: string, id: string) {
    return db.project.findFirst({
      where: { id, customerId },
      select: { id: true, name: true, _count: { select: { addresses: { where: live } } } },
    });
  },

  /** Another live project of this customer with the same name (any letter case). */
  projectNameTaken(db: AppDb, customerId: string, name: string, exceptId?: string) {
    return db.project
      .count({
        where: {
          customerId,
          name: { equals: name, mode: "insensitive" },
          ...(exceptId ? { id: { not: exceptId } } : {}),
        },
      })
      .then((n) => n > 0);
  },

  createProject(db: AppDb, data: Prisma.ProjectUncheckedCreateInput) {
    return db.project.create({
      data,
      select: { id: true, name: true, description: true, _count: { select: { addresses: { where: live } } } },
    });
  },

  updateProject(db: AppDb, id: string, data: Prisma.ProjectUncheckedUpdateInput) {
    return db.project.update({
      where: { id },
      data,
      select: { id: true, name: true, description: true, _count: { select: { addresses: { where: live } } } },
    });
  },

  softDeleteProject(db: AppDb, id: string) {
    return db.project.delete({ where: { id } });
  },

  countOpenWorkOrders(db: AppDb, where: Prisma.WorkOrderWhereInput) {
    return db.workOrder.count({ where: { ...where, status: { in: OPEN_WORK_ORDER_STATUSES } } });
  },
};
