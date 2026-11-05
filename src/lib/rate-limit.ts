import "server-only";
import { TooManyRequestsError } from "./errors";

/**
 * Fixed-window in-memory limiter. Good for a single instance; swap for a Postgres/Redis
 * store when running several app instances.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateLimitOptions = { key: string; limit: number; windowMs: number };

export function rateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  } else if (++bucket.count > limit) {
    throw new TooManyRequestsError();
  }

  // Opportunistic clean-up so the map doesn't grow forever.
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
}

export const clientIp = (headers: Headers) =>
  headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
