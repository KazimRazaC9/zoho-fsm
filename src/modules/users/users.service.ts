import "server-only";
import { Prisma } from "@prisma/client";
import { usersRepository, type UserRow } from "./users.repository";
import {
  DEFAULT_TECHNICIAN_PROFILE,
  STAFF_ROLES,
  type CreateUserInput,
  type StaffRole,
  type TechnicianProfileInput,
  type UpdateUserInput,
  type UserDto,
  type UserListQuery,
  type WeekDay,
} from "./users.schema";
import { authService, hashPassword } from "@/modules/auth";
import type { CurrentUser } from "@/lib/auth";
import type { AppDb } from "@/lib/db";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { paged, type PagedResult } from "@/lib/pagination";
import { parsePermissions } from "@/lib/permissions";
import { nullIfEmpty } from "@/lib/validation";

export function toUserDto(u: UserRow): UserDto {
  const p = u.technicianProfile && !u.technicianProfile.deletedAt ? u.technicianProfile : null;
  return {
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone,
    role: u.role as StaffRole,
    customRoleId: u.customRoleId,
    customRoleName: u.customRole?.name ?? null,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    technicianProfile: p
      ? {
          skills: p.skills,
          hourlyRate: Number(p.hourlyRate),
          workStart: p.workStart,
          workEnd: p.workEnd,
          workingDays: p.workingDays as WeekDay[],
          color: p.color,
        }
      : null,
  };
}

const profileData = (p: TechnicianProfileInput) => ({
  skills: [...new Set(p.skills.map((s) => s.trim()).filter(Boolean))],
  hourlyRate: new Prisma.Decimal(p.hourlyRate),
  workStart: p.workStart,
  workEnd: p.workEnd,
  workingDays: p.workingDays,
  color: p.color,
});

const companyOf = (actor: CurrentUser) => {
  if (!actor.companyId) throw new ForbiddenError("This action needs a company account.");
  return actor.companyId;
};

/** P2002 on (companyId, email) → a readable conflict. */
function rethrowDuplicateEmail(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    throw new ConflictError("A user with this email already exists in your company.", {
      email: ["Already used by another user (possibly a deleted one)."],
    });
  }
  throw e;
}

async function getOrThrow(db: AppDb, id: string) {
  const u = await usersRepository.findById(db, id);
  if (!u || !(STAFF_ROLES as readonly string[]).includes(u.role)) throw new NotFoundError("User", id);
  return u;
}

/**
 * A user with a custom role may only manage users whose access sits inside their own: never a
 * built-in account (Admin, Dispatcher, Technician) and never a role with permissions they lack.
 * Otherwise "edit users" would let them reset an Admin's password and take the account over.
 */
function assertMayManage(actor: CurrentUser, target: UserRow) {
  if (!actor.customRoleId || target.id === actor.id) return;
  const theirs = parsePermissions(target.customRole?.permissions);
  const within = !!target.customRoleId && theirs.every((p) => actor.permissions.includes(p));
  if (!within) throw new ForbiddenError("You can only manage users whose access is within your own.");
}

/** A company must always keep at least one active Admin. */
async function assertNotLastAdmin(db: AppDb, target: UserRow, message: string) {
  if (
    target.role === "ADMIN" &&
    target.customRoleId === null &&
    target.isActive &&
    (await usersRepository.countActiveAdmins(db, target.id)) === 0
  ) {
    throw new ConflictError(message);
  }
}

export const usersService = {
  async list(db: AppDb, q: UserListQuery): Promise<PagedResult<UserDto>> {
    const where: Prisma.UserWhereInput = {
      role: q.role ? q.role : { in: [...STAFF_ROLES] },
      ...(q.status === "active" ? { isActive: true } : q.status === "inactive" ? { isActive: false } : {}),
      ...(q.search
        ? {
            OR: [
              { fullName: { contains: q.search, mode: "insensitive" } },
              { email: { contains: q.search, mode: "insensitive" } },
              { phone: { contains: q.search } },
            ],
          }
        : {}),
    };
    const { items, total } = await usersRepository.list(
      db,
      where,
      { [q.sortBy]: q.sortDir },
      (q.page - 1) * q.pageSize,
      q.pageSize,
    );
    return paged(items.map(toUserDto), total, q);
  },

  async get(db: AppDb, id: string): Promise<UserDto> {
    return toUserDto(await getOrThrow(db, id));
  },

  /** Active technicians, for pickers (dispatch, assignment). */
  async listTechnicians(db: AppDb): Promise<UserDto[]> {
    const { items } = await usersRepository.list(
      db,
      { role: "TECHNICIAN", isActive: true },
      { fullName: "asc" },
      0,
      500,
    );
    return items.map(toUserDto);
  },

  async create(db: AppDb, actor: CurrentUser, input: CreateUserInput): Promise<UserDto> {
    const companyId = companyOf(actor);
    if (actor.customRoleId && (input.role !== actor.role || input.customRoleId !== actor.customRoleId)) {
      throw new ForbiddenError("You can only add a user with your own role.");
    }
    if (input.customRoleId) {
      const customRole = await db.customRole.findUnique({
        where: { id: input.customRoleId },
        select: { baseRole: true },
      });
      if (!customRole || customRole.baseRole !== input.role) {
        throw new BadRequestError("Choose a custom role matching the selected staff type.", {
          customRoleId: ["This custom role is unavailable for the selected staff type."],
        });
      }
    }
    const passwordHash = await hashPassword(input.password);
    try {
      return await db.$withTx(async () => {
        const user = await usersRepository.create(db, {
          companyId,
          fullName: input.fullName,
          email: input.email,
          phone: nullIfEmpty(input.phone),
          role: input.role,
          customRoleId: input.customRoleId ?? null,
          passwordHash,
        });
        if (input.role !== "TECHNICIAN") return toUserDto(user);
        await usersRepository.upsertTechnicianProfile(
          db,
          companyId,
          user.id,
          profileData(input.technicianProfile ?? DEFAULT_TECHNICIAN_PROFILE),
        );
        return toUserDto(await getOrThrow(db, user.id));
      });
    } catch (e) {
      rethrowDuplicateEmail(e);
    }
  },

  async update(db: AppDb, actor: CurrentUser, id: string, input: UpdateUserInput): Promise<UserDto> {
    const companyId = companyOf(actor);
    const current = await getOrThrow(db, id);
    assertMayManage(actor, current);
    const customRoleId = input.customRoleId === undefined ? current.customRoleId : input.customRoleId;
    if (actor.customRoleId && (input.role !== actor.role || customRoleId !== actor.customRoleId)) {
      throw new ForbiddenError("You can only assign your own role.");
    }
    if (customRoleId) {
      const customRole = await db.customRole.findUnique({
        where: { id: customRoleId },
        select: { baseRole: true },
      });
      if (!customRole || customRole.baseRole !== input.role) {
        throw new BadRequestError("Choose a custom role matching the selected staff type.", {
          customRoleId: ["This custom role is unavailable for the selected staff type."],
        });
      }
    }
    if (id === actor.id && (input.role !== current.role || customRoleId !== current.customRoleId)) {
      throw new BadRequestError("You cannot change your own role.", { role: ["You cannot change your own role."] });
    }
    if (input.role !== "ADMIN" || customRoleId != null) {
      await assertNotLastAdmin(db, current, "The company needs at least one active Admin.");
    }

    try {
      return await db.$withTx(async () => {
        await usersRepository.update(db, id, {
          fullName: input.fullName,
          email: input.email,
          phone: nullIfEmpty(input.phone),
          role: input.role,
          customRole: customRoleId ? { connect: { id: customRoleId } } : { disconnect: true },
        });
        // Becoming a technician: make sure there is a profile to schedule against.
        if (input.role === "TECHNICIAN" && (!current.technicianProfile || current.technicianProfile.deletedAt)) {
          await usersRepository.upsertTechnicianProfile(db, companyId, id, profileData(DEFAULT_TECHNICIAN_PROFILE));
        }
        return toUserDto(await getOrThrow(db, id));
      });
    } catch (e) {
      rethrowDuplicateEmail(e);
    }
  },

  async setActive(db: AppDb, actor: CurrentUser, id: string, isActive: boolean): Promise<UserDto> {
    const current = await getOrThrow(db, id);
    assertMayManage(actor, current);
    if (!isActive) {
      if (id === actor.id) throw new BadRequestError("You cannot deactivate your own account.");
      await assertNotLastAdmin(db, current, "You cannot deactivate the last active Admin.");
    }
    const updated = await usersRepository.update(db, id, { isActive });
    if (!isActive) await authService.revokeSessionsForUsers([id]);
    return toUserDto(updated);
  },

  async resetPassword(db: AppDb, actor: CurrentUser, id: string, password: string): Promise<void> {
    assertMayManage(actor, await getOrThrow(db, id));
    await usersRepository.update(db, id, { passwordHash: await hashPassword(password) });
    // The user must sign in again on every device with the new password.
    if (id !== actor.id) await authService.revokeSessionsForUsers([id]);
  },

  async remove(db: AppDb, actor: CurrentUser, id: string): Promise<void> {
    const current = await getOrThrow(db, id);
    assertMayManage(actor, current);
    if (id === actor.id) throw new BadRequestError("You cannot delete your own account.");
    await assertNotLastAdmin(db, current, "You cannot delete the last active Admin.");
    await usersRepository.softDelete(db, id);
    await authService.revokeSessionsForUsers([id]);
  },

  async updateTechnicianProfile(
    db: AppDb,
    actor: CurrentUser,
    id: string,
    input: TechnicianProfileInput,
  ): Promise<UserDto> {
    const companyId = companyOf(actor);
    const user = await getOrThrow(db, id);
    assertMayManage(actor, user);
    if (user.role !== "TECHNICIAN") throw new BadRequestError("Only technicians have a technician profile.");
    await usersRepository.upsertTechnicianProfile(db, companyId, id, profileData(input));
    return toUserDto(await getOrThrow(db, id));
  },
};
