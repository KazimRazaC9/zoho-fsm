import { publicRoute } from "@/lib/api";
import { systemDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/v1/health — app + database reachability. */
export const GET = publicRoute({}, async () => {
  const db = systemDb("health-check");
  const [row] = await db.$rawInContext((tx) => tx.$queryRaw<{ now: Date }[]>`SELECT now() AS now`);
  return { status: "ok", database: "ok", time: row.now };
});
