import "server-only";
import { Prisma } from "@prisma/client";
import { customersRepository, type AddressRow, type CustomerListRow, type CustomerRow } from "./customers.repository";
import { siteLabelOf } from "./customers.schema";
import type {
  AddressDto,
  AddressInput,
  CreateCustomerInput,
  CustomerDto,
  CustomerListItem,
  CustomerListQuery,
  CustomerOption,
  ProjectDto,
  ProjectInput,
  UpdateCustomerInput,
} from "./customers.schema";
import type { CurrentUser } from "@/lib/auth";
import type { AppDb } from "@/lib/db";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { paged, type PagedResult } from "@/lib/pagination";
import { nullIfEmpty } from "@/lib/validation";
import { workHistory, type WorkHistoryItem } from "@/lib/work-history";

const companyOf = (actor: CurrentUser) => {
  if (!actor.companyId) throw new ForbiddenError("This action needs a company account.");
  return actor.companyId;
};

const num = (d: Prisma.Decimal | null) => (d == null ? null : Number(d));

export function toAddressDto(a: AddressRow): AddressDto {
  return {
    id: a.id,
    projectId: a.project && !a.project.deletedAt ? a.projectId : null,
    projectName: a.project && !a.project.deletedAt ? a.project.name : null,
    label: a.label,
    addressLine: a.addressLine,
    city: a.city,
    state: a.state,
    postalCode: a.postalCode,
    country: a.country,
    latitude: num(a.latitude),
    longitude: num(a.longitude),
    fullAddress: [a.addressLine, a.city, a.state, a.postalCode, a.country].filter(Boolean).join(", "),
  };
}

type ProjectRow = { id: string; name: string; description: string | null; _count: { addresses: number } };
const toProjectDto = (p: ProjectRow): ProjectDto => ({
  id: p.id,
  name: p.name,
  description: p.description,
  siteCount: p._count.addresses,
});

const toListItem = (c: CustomerListRow): CustomerListItem => ({
  id: c.id,
  type: c.type,
  name: c.name,
  email: c.email,
  phone: c.phone,
  primaryAddress: c.addresses[0] ? toAddressDto(c.addresses[0]).fullAddress : null,
  projectNames: c.projects.map((p) => p.name),
  addressCount: c._count.addresses,
  assetCount: c._count.assets,
  openWorkOrders: c._count.workOrders,
  createdAt: c.createdAt.toISOString(),
});

const toDto = (c: CustomerRow): CustomerDto => ({
  id: c.id,
  type: c.type,
  name: c.name,
  email: c.email,
  phone: c.phone,
  notes: c.notes,
  createdAt: c.createdAt.toISOString(),
  projects: c.projects.map(toProjectDto),
  addresses: c.addresses.map(toAddressDto),
});

const customerData = (i: UpdateCustomerInput) => ({
  type: i.type,
  name: i.name,
  email: nullIfEmpty(i.email),
  phone: nullIfEmpty(i.phone),
  notes: nullIfEmpty(i.notes),
});

const addressData = (a: AddressInput) => ({
  projectId: a.projectId || null,
  label: nullIfEmpty(a.label),
  addressLine: a.addressLine,
  city: nullIfEmpty(a.city),
  state: nullIfEmpty(a.state),
  postalCode: nullIfEmpty(a.postalCode),
  country: nullIfEmpty(a.country),
  latitude: a.latitude ? new Prisma.Decimal(a.latitude) : null,
  longitude: a.longitude ? new Prisma.Decimal(a.longitude) : null,
});

async function getOrThrow(db: AppDb, id: string) {
  const c = await customersRepository.findById(db, id);
  if (!c) throw new NotFoundError("Customer", id);
  return c;
}

async function addressOrThrow(db: AppDb, customerId: string, id: string) {
  const a = await customersRepository.findAddress(db, customerId, id);
  if (!a) throw new NotFoundError("Service address", id);
  return a;
}

/** The project must be one of this customer's (or empty: no project). */
async function assertProject(db: AppDb, customerId: string, projectId: string | undefined) {
  if (!projectId) return;
  if (!(await customersRepository.findProject(db, customerId, projectId))) {
    throw new BadRequestError("That project is not one of this customer's.", {
      projectId: ["Choose one of this customer's projects."],
    });
  }
}

/** Search text for a customer: name, email, phone, or any of its live addresses. */
function searchWhere(search: string): Prisma.CustomerWhereInput {
  const has = { contains: search, mode: "insensitive" } as const;
  return {
    OR: [
      { name: has },
      { email: has },
      { projects: { some: { deletedAt: null, name: has } } },
      { phone: { contains: search } },
      { addresses: { some: { deletedAt: null, OR: [{ addressLine: has }, { city: has }, { label: has }] } } },
    ],
  };
}

export const customersService = {
  async list(db: AppDb, q: CustomerListQuery): Promise<PagedResult<CustomerListItem>> {
    const where: Prisma.CustomerWhereInput = {
      ...(q.type ? { type: q.type } : {}),
      ...(q.search ? searchWhere(q.search) : {}),
    };
    const { items, total } = await customersRepository.list(
      db,
      where,
      { [q.sortBy]: q.sortDir },
      (q.page - 1) * q.pageSize,
      q.pageSize,
    );
    return paged(items.map(toListItem), total, q);
  },

  async get(db: AppDb, id: string): Promise<CustomerDto> {
    return toDto(await getOrThrow(db, id));
  },

  /** Up to `take` customers with their sites, for pickers. */
  async options(db: AppDb, search?: string, take = 200): Promise<CustomerOption[]> {
    const rows = await customersRepository.options(db, search ? searchWhere(search) : {}, take);
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      addresses: c.addresses.map((a) => ({
        id: a.id,
        label: siteLabelOf({
          projectName: a.project && !a.project.deletedAt ? a.project.name : null,
          label: a.label,
          addressLine: a.addressLine,
        }),
      })),
      assets: c.assets,
    }));
  },

  /** Work orders for this customer, newest first. */
  async history(db: AppDb, id: string, addressIds?: string[]): Promise<WorkHistoryItem[]> {
    await getOrThrow(db, id);
    return workHistory(db, { customerId: id, ...(addressIds ? { addressId: { in: addressIds } } : {}) });
  },

  async create(db: AppDb, actor: CurrentUser, input: CreateCustomerInput): Promise<CustomerDto> {
    const companyId = companyOf(actor);
    return db.$withTx(async () => {
      const { id } = await customersRepository.create(db, { companyId, ...customerData(input) });
      for (const a of input.addresses) {
        // A brand-new customer has no projects yet.
        await customersRepository.createAddress(db, { companyId, customerId: id, ...addressData(a), projectId: null });
      }
      return toDto(await getOrThrow(db, id));
    });
  },

  async update(db: AppDb, id: string, input: UpdateCustomerInput): Promise<CustomerDto> {
    await getOrThrow(db, id);
    await customersRepository.update(db, id, customerData(input));
    return toDto(await getOrThrow(db, id));
  },

  /** Soft-deletes the customer with its sites and assets. Refused while it has open work orders. */
  async remove(db: AppDb, id: string): Promise<void> {
    const c = await getOrThrow(db, id);
    const open = await customersRepository.countOpenWorkOrders(db, { customerId: id });
    if (open > 0) {
      throw new ConflictError(
        `${c.name} has ${open} open work order${open === 1 ? "" : "s"}. Complete or cancel ${open === 1 ? "it" : "them"} first.`,
      );
    }
    await db.$withTx(async () => {
      await customersRepository.softDeleteChildren(db, id);
      await customersRepository.softDelete(db, id);
    });
  },

  // ---------------------------------------------------------------- projects
  async addProject(db: AppDb, actor: CurrentUser, customerId: string, input: ProjectInput): Promise<ProjectDto> {
    const companyId = companyOf(actor);
    await getOrThrow(db, customerId);
    if (await customersRepository.projectNameTaken(db, customerId, input.name)) {
      throw new ConflictError("This customer already has a project with that name.", {
        name: ["This customer already has a project with that name."],
      });
    }
    return toProjectDto(
      await customersRepository.createProject(db, {
        companyId,
        customerId,
        name: input.name,
        description: nullIfEmpty(input.description),
      }),
    );
  },

  async updateProject(db: AppDb, customerId: string, id: string, input: ProjectInput): Promise<ProjectDto> {
    if (!(await customersRepository.findProject(db, customerId, id))) throw new NotFoundError("Project", id);
    if (await customersRepository.projectNameTaken(db, customerId, input.name, id)) {
      throw new ConflictError("This customer already has a project with that name.", {
        name: ["This customer already has a project with that name."],
      });
    }
    return toProjectDto(
      await customersRepository.updateProject(db, id, {
        name: input.name,
        description: nullIfEmpty(input.description),
      }),
    );
  },

  /** A project with sites cannot be deleted: move or delete its sites first, so nothing is lost silently. */
  async removeProject(db: AppDb, customerId: string, id: string): Promise<void> {
    const p = await customersRepository.findProject(db, customerId, id);
    if (!p) throw new NotFoundError("Project", id);
    const n = p._count.addresses;
    if (n > 0) {
      throw new ConflictError(
        `${p.name} still has ${n} site${n === 1 ? "" : "s"}. Move ${n === 1 ? "it" : "them"} to another project or delete ${n === 1 ? "it" : "them"} first.`,
      );
    }
    await customersRepository.softDeleteProject(db, id);
  },

  async addAddress(db: AppDb, actor: CurrentUser, customerId: string, input: AddressInput): Promise<AddressDto> {
    const companyId = companyOf(actor);
    await getOrThrow(db, customerId);
    await assertProject(db, customerId, input.projectId);
    return toAddressDto(await customersRepository.createAddress(db, { companyId, customerId, ...addressData(input) }));
  },

  async updateAddress(db: AppDb, customerId: string, id: string, input: AddressInput): Promise<AddressDto> {
    await addressOrThrow(db, customerId, id);
    await assertProject(db, customerId, input.projectId);
    return toAddressDto(await customersRepository.updateAddress(db, id, addressData(input)));
  },

  /** A customer keeps at least one site; sites with open work orders cannot be removed. */
  async removeAddress(db: AppDb, customerId: string, id: string): Promise<void> {
    await addressOrThrow(db, customerId, id);
    if ((await customersRepository.countAddresses(db, customerId)) <= 1) {
      throw new ConflictError("A customer needs at least one service address. Add another one first.");
    }
    const open = await customersRepository.countOpenWorkOrders(db, { addressId: id });
    if (open > 0) throw new ConflictError(`This address has ${open} open work order${open === 1 ? "" : "s"}.`);
    await db.$withTx(async () => {
      await customersRepository.detachAssetsFromAddress(db, id);
      await customersRepository.softDeleteAddress(db, id);
    });
  },
};
