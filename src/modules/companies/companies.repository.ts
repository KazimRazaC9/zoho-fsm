import "server-only";
import type { Prisma } from "@prisma/client";
import type { AppDb } from "@/lib/db";

export const companiesRepository = {
  findById(db: AppDb, id: string) {
    return db.company.findUnique({ where: { id } });
  },

  update(db: AppDb, id: string, data: Prisma.CompanyUpdateInput) {
    return db.company.update({ where: { id }, data });
  },

  /** Super Admin list (system context). */
  async list(db: AppDb, search: string | undefined) {
    return db.company.findMany({
      where: search ? { name: { contains: search, mode: "insensitive" } } : {},
      orderBy: { createdAt: "desc" },
      include: {
        users: {
          where: { deletedAt: null },
          select: { role: true, email: true, isActive: true },
        },
      },
    });
  },

  createWithAdmin(
    db: AppDb,
    company: Prisma.CompanyCreateInput,
    admin: { fullName: string; email: string; passwordHash: string },
  ) {
    return db.$withTx(async () => {
      const created = await db.company.create({ data: company });
      await db.user.create({ data: { ...admin, role: "ADMIN", companyId: created.id } });
      return created;
    });
  },

  userIdsOfCompany(db: AppDb, companyId: string) {
    return db.user.findMany({ where: { companyId }, select: { id: true } });
  },
};
