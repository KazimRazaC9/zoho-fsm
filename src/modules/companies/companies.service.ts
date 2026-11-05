import "server-only";
import { Prisma, type Company } from "@prisma/client";
import { companiesRepository } from "./companies.repository";
import type { CompanyDto, CompanyListItem, CompanySettingsInput, CreateCompanyInput } from "./companies.schema";
import { authService, hashPassword } from "@/modules/auth";
import type { CurrentUser } from "@/lib/auth";
import type { AppDb } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { nullIfEmpty } from "@/lib/validation";

export function toCompanyDto(c: Company): CompanyDto {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    address: c.address,
    logoUrl: c.logoUrl,
    timeZone: c.timeZone,
    currency: c.currency,
    taxPercent: Number(c.taxPercent),
    requireSignatureOnComplete: c.requireSignatureOnComplete,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
  };
}

const settingsData = (input: CompanySettingsInput): Prisma.CompanyUpdateInput => ({
  name: input.name,
  email: nullIfEmpty(input.email),
  phone: nullIfEmpty(input.phone),
  address: nullIfEmpty(input.address),
  logoUrl: nullIfEmpty(input.logoUrl),
  timeZone: input.timeZone,
  currency: input.currency,
  taxPercent: new Prisma.Decimal(input.taxPercent),
  requireSignatureOnComplete: input.requireSignatureOnComplete,
});

const requireSuperAdmin = (actor: CurrentUser) => {
  if (actor.role !== "SUPER_ADMIN") throw new ForbiddenError();
};

export const companiesService = {
  /** The caller's own company. */
  async getSettings(db: AppDb, actor: CurrentUser): Promise<CompanyDto> {
    if (!actor.companyId) throw new NotFoundError("Company");
    const c = await companiesRepository.findById(db, actor.companyId);
    if (!c) throw new NotFoundError("Company");
    return toCompanyDto(c);
  },

  async updateSettings(db: AppDb, actor: CurrentUser, input: CompanySettingsInput): Promise<CompanyDto> {
    if (!actor.companyId) throw new NotFoundError("Company");
    return toCompanyDto(await companiesRepository.update(db, actor.companyId, settingsData(input)));
  },

  // ---------------------------------------------------------------- Super Admin

  async list(db: AppDb, actor: CurrentUser, search?: string): Promise<CompanyListItem[]> {
    requireSuperAdmin(actor);
    const rows = await companiesRepository.list(db, search);
    return rows.map(({ users, ...c }) => ({
      ...toCompanyDto(c),
      userCount: users.length,
      adminEmails: users.filter((u) => u.role === "ADMIN" && u.isActive).map((u) => u.email),
    }));
  },

  async get(db: AppDb, actor: CurrentUser, id: string): Promise<CompanyDto> {
    requireSuperAdmin(actor);
    const c = await companiesRepository.findById(db, id);
    if (!c) throw new NotFoundError("Company", id);
    return toCompanyDto(c);
  },

  async update(db: AppDb, actor: CurrentUser, id: string, input: CompanySettingsInput): Promise<CompanyDto> {
    requireSuperAdmin(actor);
    await companiesService.get(db, actor, id);
    return toCompanyDto(await companiesRepository.update(db, id, settingsData(input)));
  },

  async create(db: AppDb, actor: CurrentUser, input: CreateCompanyInput): Promise<CompanyDto> {
    requireSuperAdmin(actor);
    try {
      const company = await companiesRepository.createWithAdmin(
        db,
        {
          name: input.name,
          email: nullIfEmpty(input.email),
          phone: nullIfEmpty(input.phone),
          timeZone: input.timeZone,
          currency: input.currency,
          taxPercent: new Prisma.Decimal(input.taxPercent),
          createdById: actor.id,
          updatedById: actor.id,
        },
        {
          fullName: input.admin.fullName,
          email: input.admin.email,
          passwordHash: await hashPassword(input.admin.password),
        },
      );
      return toCompanyDto(company);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictError("That admin email is already in use.", { "admin.email": ["Already in use."] });
      }
      throw e;
    }
  },

  /** Disabling a company blocks every login of its users at once (sessions + refresh tokens). */
  async setActive(db: AppDb, actor: CurrentUser, id: string, isActive: boolean): Promise<CompanyDto> {
    requireSuperAdmin(actor);
    await companiesService.get(db, actor, id);
    const updated = await companiesRepository.update(db, id, { isActive });
    if (!isActive) {
      const users = await companiesRepository.userIdsOfCompany(db, id);
      await authService.revokeSessionsForUsers(users.map((u) => u.id));
    }
    return toCompanyDto(updated);
  },
};
