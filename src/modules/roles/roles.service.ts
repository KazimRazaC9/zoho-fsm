import "server-only";
import { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import type { AppDb } from "@/lib/db";
import { PERMISSIONS, parsePermissions } from "@/lib/permissions";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { STAFF_ROLES, type StaffRole } from "@/modules/users/users.schema";
import type { CustomRoleDto, CustomRoleInput } from "./roles.schema";

const companyOf = (actor: CurrentUser) => {
  if (!actor.companyId) throw new ForbiddenError("This action needs a company account.");
  return actor.companyId;
};

function toDto(role: {
  id: string;
  name: string;
  description: string | null;
  baseRole: string;
  permissions: Prisma.JsonValue;
  createdAt: Date;
  _count: { users: number };
}): CustomRoleDto {
  if (!(STAFF_ROLES as readonly string[]).includes(role.baseRole)) {
    throw new Error("Custom role has an unsupported staff type.");
  }
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    baseRole: role.baseRole as StaffRole,
    permissions: parsePermissions(role.permissions),
    memberCount: role._count.users,
    createdAt: role.createdAt.toISOString(),
  };
}

const dtoSelect = {
  id: true,
  name: true,
  description: true,
  baseRole: true,
  permissions: true,
  createdAt: true,
  _count: { select: { users: true } },
} satisfies Prisma.CustomRoleSelect;

export const rolesService = {
  async list(db: AppDb): Promise<CustomRoleDto[]> {
    const roles = await db.customRole.findMany({ orderBy: { name: "asc" }, select: dtoSelect });
    return roles.map(toDto);
  },

  async create(db: AppDb, actor: CurrentUser, input: CustomRoleInput): Promise<CustomRoleDto> {
    const companyId = companyOf(actor);
    if (input.permissions.some((permission) => !PERMISSIONS.includes(permission as (typeof PERMISSIONS)[number]))) {
      throw new ConflictError("One or more permissions are no longer available.");
    }
    try {
      return toDto(
        await db.customRole.create({
          data: { ...input, companyId, permissions: input.permissions },
          select: dtoSelect,
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("A role with this name already exists.");
      }
      throw error;
    }
  },

  async update(db: AppDb, id: string, input: CustomRoleInput): Promise<CustomRoleDto> {
    const current = await db.customRole.findUnique({
      where: { id },
      select: { id: true, baseRole: true, _count: { select: { users: true } } },
    });
    if (!current) throw new NotFoundError("Role", id);
    if (current._count.users > 0 && current.baseRole !== input.baseRole) {
      throw new ConflictError("Reassign this role's users before changing its staff type.");
    }
    try {
      return toDto(
        await db.customRole.update({
          where: { id },
          data: { ...input, permissions: input.permissions },
          select: dtoSelect,
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("A role with this name already exists.");
      }
      throw error;
    }
  },

  async remove(db: AppDb, id: string): Promise<void> {
    const role = await db.customRole.findUnique({
      where: { id },
      select: { id: true, _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundError("Role", id);
    if (role._count.users > 0) throw new ConflictError("Reassign this role's users before deleting it.");
    try {
      await db.customRole.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new ConflictError("Reassign this role's users before deleting it.");
      }
      throw error;
    }
  },
};
