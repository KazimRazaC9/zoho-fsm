import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/auth";
import { createDb, systemContext, systemDb, tenantContext, type AppDb } from "./db";
import { ForbiddenError, UnauthorizedError } from "./errors";
import type { AppRole } from "./roles";
import { bearerFrom, verifyAccessToken } from "./tokens";

/** Who is calling, from the bearer token (mobile/API) or the Auth.js session cookie (web). */
export type CurrentUser = {
  id: string;
  role: AppRole;
  companyId: string | null;
  fullName: string;
  email: string;
  via: "bearer" | "session";
};

/**
 * The account as stored right now (once per request). A deactivated user or disabled company is
 * locked out immediately, and a role change applies at once — even though the session cookie or
 * access token was issued earlier.
 */
const liveAccount = cache(async (userId: string) => {
  const u = await systemDb("auth-check").user.findFirst({
    where: { id: userId },
    select: {
      isActive: true,
      role: true,
      companyId: true,
      fullName: true,
      email: true,
      company: { select: { isActive: true, deletedAt: true } },
    },
  });
  if (!u || !u.isActive) return null;
  if (u.company && (!u.company.isActive || u.company.deletedAt)) return null;
  return u;
});

export async function getCurrentUser(reqHeaders?: Headers): Promise<CurrentUser | null> {
  const h = reqHeaders ?? (await headers());
  const bearer = bearerFrom(h);

  let identity: { id: string; via: CurrentUser["via"] } | null = null;
  if (bearer) {
    const claims = await verifyAccessToken(bearer);
    // A bad bearer token never falls back to the cookie: the client asked to be judged by it.
    if (!claims) return null;
    identity = { id: claims.sub, via: "bearer" };
  } else {
    const session = await auth();
    if (!session?.user?.id) return null;
    identity = { id: session.user.id, via: "session" };
  }

  const account = await liveAccount(identity.id);
  if (!account) return null;
  return {
    id: identity.id,
    role: account.role as AppRole,
    companyId: account.companyId,
    fullName: account.fullName,
    email: account.email,
    via: identity.via,
  };
}

export async function requireUser(reqHeaders?: Headers): Promise<CurrentUser> {
  const user = await getCurrentUser(reqHeaders);
  if (!user) throw new UnauthorizedError();
  return user;
}

export function requireRole(user: CurrentUser, roles: readonly AppRole[]) {
  if (!roles.includes(user.role)) throw new ForbiddenError();
}

/**
 * The database client for this caller: tenant-scoped for company users; system context only for
 * a SUPER_ADMIN, who has no company.
 */
export function dbFor(user: CurrentUser): AppDb {
  if (user.companyId) return createDb(tenantContext(user.companyId, user.id));
  if (user.role === "SUPER_ADMIN") return createDb(systemContext("super-admin", user.id));
  throw new ForbiddenError("Your account is not linked to a company.");
}
