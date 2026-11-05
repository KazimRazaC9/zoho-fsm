import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { Role } from "@prisma/client";
import { env } from "./env";

/** Bearer tokens for mobile / API clients (the web dashboard uses the Auth.js session cookie). */

const ISSUER = "fieldserve";
const AUDIENCE = "fieldserve-api";
const key = new TextEncoder().encode(env.JWT_SECRET);

export type AccessClaims = {
  sub: string; // user id
  cid: string | null; // company id (null for SUPER_ADMIN)
  role: Role;
  name: string;
  email: string;
};

export async function signAccessToken(claims: AccessClaims) {
  const expiresAt = new Date(Date.now() + env.ACCESS_TOKEN_TTL_MINUTES * 60_000);
  const token = await new SignJWT({ cid: claims.cid, role: claims.role, name: claims.name, email: claims.email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setJti(randomBytes(12).toString("hex"))
    .setExpirationTime(expiresAt)
    .sign(key);
  return { token, expiresAt };
}

/** Returns the claims, or null when the token is missing, expired or tampered with. */
export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.role !== "string") return null;
    return {
      sub: payload.sub,
      cid: (payload.cid as string | null) ?? null,
      role: payload.role as Role,
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
    };
  } catch {
    return null;
  }
}

/** Opaque refresh token: 64 random bytes; only its SHA-256 hash is stored. */
export function createRefreshToken() {
  const raw = randomBytes(64).toString("base64url");
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  return { raw, hash: hashToken(raw), expiresAt };
}

export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

export const bearerFrom = (headers: Headers) => {
  const h = headers.get("authorization");
  return h && /^Bearer\s+/i.test(h) ? h.replace(/^Bearer\s+/i, "").trim() : null;
};
