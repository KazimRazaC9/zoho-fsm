import "server-only";
import type { Prisma } from "@prisma/client";
import type { AppDb } from "@/lib/db";

/** Never select passwordHash out of this module. */
export const userSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  customRoleId: true,
  customRole: { select: { name: true, permissions: true } },
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  technicianProfile: {
    select: {
      skills: true,
      hourlyRate: true,
      workStart: true,
      workEnd: true,
      workingDays: true,
      color: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.UserSelect;

export type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export const usersRepository = {
  async list(
    db: AppDb,
    where: Prisma.UserWhereInput,
    orderBy: Prisma.UserOrderByWithRelationInput,
    skip: number,
    take: number,
  ) {
    const [items, total] = await Promise.all([
      db.user.findMany({ where, orderBy, skip, take, select: userSelect }),
      db.user.count({ where }),
    ]);
    return { items, total };
  },

  findById(db: AppDb, id: string) {
    return db.user.findFirst({ where: { id }, select: userSelect });
  },

  create(db: AppDb, data: Prisma.UserUncheckedCreateInput) {
    return db.user.create({ data, select: userSelect });
  },

  update(db: AppDb, id: string, data: Prisma.UserUpdateInput) {
    return db.user.update({ where: { id }, data, select: userSelect });
  },

  softDelete(db: AppDb, id: string) {
    return db.user.delete({ where: { id } });
  },

  countActiveAdmins(db: AppDb, excludingId: string) {
    return db.user.count({
      where: { role: "ADMIN", customRoleId: null, isActive: true, id: { not: excludingId } },
    });
  },

  upsertTechnicianProfile(
    db: AppDb,
    companyId: string,
    userId: string,
    data: Omit<Prisma.TechnicianProfileUncheckedCreateInput, "companyId" | "userId">,
  ) {
    return db.technicianProfile.upsert({
      where: { userId },
      create: { ...data, companyId, userId },
      update: { ...data, deletedAt: null },
    });
  },
};
