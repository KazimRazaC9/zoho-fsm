import "server-only";
import bcrypt from "bcryptjs";
import { authRepository } from "./auth.repository";
import type { ChangePasswordInput, SessionUser, TokenResponse } from "./auth.schema";
import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { AppRole } from "@/lib/roles";
import { createRefreshToken, hashToken, signAccessToken } from "@/lib/tokens";

const BCRYPT_COST = 11;
// Compared against when no user matches, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("fieldserve-timing-dummy", BCRYPT_COST);

type UserRow = NonNullable<Awaited<ReturnType<typeof authRepository.findUserById>>>;

const companyUsable = (u: UserRow) => u.company == null || (u.company.isActive && u.company.deletedAt == null);

export function toSessionUser(u: UserRow): SessionUser {
  return {
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    role: u.role as AppRole,
    companyId: u.companyId,
    companyName: u.company?.name ?? null,
    timeZone: u.company?.timeZone ?? null,
    currency: u.company?.currency ?? null,
  };
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_COST);

export const authService = {
  /**
   * Email + password → user, or null. If the same email exists in several companies, the account
   * whose password matches is used (the most recently active one if several match).
   */
  async verifyCredentials(email: string, password: string): Promise<SessionUser | null> {
    const candidates = (await authRepository.findActiveUsersByEmail(email)).filter(companyUsable);
    // The customer portal arrives in release 1.1.
    const allowed = candidates.filter((u) => u.role !== "CUSTOMER");

    const matches: UserRow[] = [];
    for (const u of allowed) if (await bcrypt.compare(password, u.passwordHash)) matches.push(u);
    if (allowed.length === 0) await bcrypt.compare(password, DUMMY_HASH);

    if (matches.length === 0) {
      logger.warn({ email }, "auth.login_failed");
      return null;
    }
    const user = matches.sort((a, b) => (b.lastLoginAt?.getTime() ?? 0) - (a.lastLoginAt?.getTime() ?? 0))[0];
    await authRepository.touchLastLogin(user.id);
    logger.info({ userId: user.id, companyId: user.companyId }, "auth.login");
    return toSessionUser(user);
  },

  /** Bearer token pair for mobile/API clients. */
  async issueTokens(user: SessionUser, ip: string | null): Promise<TokenResponse> {
    const access = await signAccessToken({
      sub: user.id,
      cid: user.companyId,
      role: user.role,
      name: user.fullName,
      email: user.email,
    });
    const refresh = createRefreshToken();
    await authRepository.createRefreshToken({
      userId: user.id,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
      createdByIp: ip,
    });
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken: refresh.raw,
      refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
      user,
    };
  },

  async loginForTokens(email: string, password: string, ip: string | null): Promise<TokenResponse> {
    const user = await authService.verifyCredentials(email, password);
    if (!user) throw new UnauthorizedError("Invalid email or password.");
    return authService.issueTokens(user, ip);
  },

  /**
   * Rotates a refresh token. Presenting an already-revoked token means it was copied:
   * every session of that user is revoked.
   */
  async refresh(rawToken: string, ip: string | null): Promise<TokenResponse> {
    const hash = hashToken(rawToken);
    const existing = await authRepository.findRefreshToken(hash);
    if (!existing) throw new UnauthorizedError("Invalid refresh token.");

    if (existing.revokedAt) {
      logger.warn({ userId: existing.userId, ip }, "auth.refresh_reuse_detected");
      await authRepository.revokeAllForUser(existing.userId);
      throw new UnauthorizedError("Refresh token was already used. Please sign in again.");
    }
    if (existing.expiresAt <= new Date()) throw new UnauthorizedError("Refresh token expired. Please sign in again.");

    const u = existing.user;
    if (!u.isActive || u.deletedAt || !companyUsable(u)) throw new UnauthorizedError("Account is disabled.");

    const next = createRefreshToken();
    // Atomic: if two requests race with the same token, only one wins.
    if (!(await authRepository.rotateRefreshToken(hash, next.hash))) {
      await authRepository.revokeAllForUser(existing.userId);
      throw new UnauthorizedError("Refresh token was already used. Please sign in again.");
    }
    await authRepository.createRefreshToken({
      userId: u.id,
      tokenHash: next.hash,
      expiresAt: next.expiresAt,
      createdByIp: ip,
    });

    const user = toSessionUser(u);
    const access = await signAccessToken({
      sub: user.id,
      cid: user.companyId,
      role: user.role,
      name: user.fullName,
      email: user.email,
    });
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken: next.raw,
      refreshTokenExpiresAt: next.expiresAt.toISOString(),
      user,
    };
  },

  async logout(rawToken: string, userId: string) {
    const token = await authRepository.findRefreshToken(hashToken(rawToken));
    if (token && token.userId === userId) await authRepository.revokeRefreshToken(token.tokenHash);
  },

  /**
   * Ends mobile sessions (refresh tokens) of these users. Web sessions end on their next request,
   * because every request re-checks that the account is still active (lib/auth.ts).
   */
  async revokeSessionsForUsers(userIds: string[]) {
    if (userIds.length > 0) await authRepository.revokeAllForUsers(userIds);
  },

  async getMe(userId: string): Promise<SessionUser> {
    const u = await authRepository.findUserById(userId);
    if (!u || !u.isActive || !companyUsable(u)) throw new UnauthorizedError("Account is disabled.");
    return toSessionUser(u);
  },

  async changePassword(userId: string, input: ChangePasswordInput) {
    const u = await authRepository.findUserById(userId);
    if (!u) throw new UnauthorizedError();
    if (!(await bcrypt.compare(input.currentPassword, u.passwordHash))) {
      throw new BadRequestError("Current password is incorrect.", {
        currentPassword: ["Current password is incorrect."],
      });
    }
    await authRepository.updatePassword(userId, await hashPassword(input.newPassword));
    await authRepository.revokeAllForUser(userId); // sign out other devices
  },
};
