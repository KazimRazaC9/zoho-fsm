import "server-only";
import { systemDb } from "@/lib/db";

/**
 * Auth runs before a tenant is known (login, refresh), so it uses a system-context client.
 * Nothing outside this module may import this file.
 */
const db = () => systemDb("auth");

const userWithCompany = {
  company: { select: { id: true, name: true, timeZone: true, currency: true, isActive: true, deletedAt: true } },
} as const;

export const authRepository = {
  findActiveUsersByEmail(email: string) {
    return db().user.findMany({ where: { email, isActive: true }, include: userWithCompany });
  },

  findUserById(id: string) {
    return db().user.findFirst({ where: { id }, include: userWithCompany });
  },

  /** lastLoginAt is bookkeeping, not a business change: written without an audit entry. */
  touchLastLogin(id: string) {
    return db().$rawInContext((tx) => tx.user.update({ where: { id }, data: { lastLoginAt: new Date() } }));
  },

  updatePassword(id: string, passwordHash: string) {
    return db().user.update({ where: { id }, data: { passwordHash } });
  },

  createRefreshToken(data: { userId: string; tokenHash: string; expiresAt: Date; createdByIp: string | null }) {
    return db().refreshToken.create({ data });
  },

  findRefreshToken(tokenHash: string) {
    return db().refreshToken.findUnique({ where: { tokenHash }, include: { user: { include: userWithCompany } } });
  },

  /** Revokes `tokenHash` only if still active; returns false when another request rotated it first. */
  async rotateRefreshToken(tokenHash: string, replacedByHash: string) {
    const res = await db().refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date(), replacedByHash },
    });
    return res.count === 1;
  },

  revokeRefreshToken(tokenHash: string) {
    return db().refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
  },

  revokeAllForUser(userId: string) {
    return db().refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  },

  revokeAllForUsers(userIds: string[]) {
    return db().refreshToken.updateMany({
      where: { userId: { in: userIds }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
