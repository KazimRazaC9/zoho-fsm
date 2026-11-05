import "server-only";
import type { AppDb } from "./db";
import { ForbiddenError } from "./errors";

export const NumberPrefix = {
  serviceRequest: "SR",
  estimate: "EST",
  workOrder: "WO",
  invoice: "INV",
} as const;
export type NumberPrefix = (typeof NumberPrefix)[keyof typeof NumberPrefix];

/** Formats 123 → "WO-000123". */
export const formatNumber = (prefix: string, n: number) => `${prefix}-${String(n).padStart(6, "0")}`;

/**
 * Reserves the next readable number for the caller's company in one atomic statement
 * (INSERT … ON CONFLICT DO UPDATE … RETURNING), safe under concurrent requests.
 * Call it inside `db.$withTx` together with the insert that uses the number.
 */
export async function nextNumber(db: AppDb, prefix: NumberPrefix): Promise<string> {
  const ctx = db.$dbContext();
  if (ctx.kind !== "tenant") throw new ForbiddenError("Document numbers need a company context.");

  const rows = await db.$rawInContext(
    (tx) =>
      tx.$queryRaw<{ last: number }[]>`
      INSERT INTO "NumberSequence" ("companyId", "entityType", "last")
      VALUES (${ctx.companyId}, ${prefix}, 1)
      ON CONFLICT ("companyId", "entityType")
      DO UPDATE SET "last" = "NumberSequence"."last" + 1
      RETURNING "last"`,
  );
  return formatNumber(prefix, rows[0].last);
}
