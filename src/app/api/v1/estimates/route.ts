import { ok, route } from "@/lib/api";
import { estimateListQuerySchema, estimateSchema, estimatesService } from "@/modules/estimates";

const OPS = ["ADMIN", "DISPATCHER"] as const;

/** GET /api/v1/estimates?status=DRAFT|SENT|APPROVED|REJECTED|all&search */
export const GET = route({ roles: OPS, query: estimateListQuerySchema }, ({ db, user, query }) =>
  estimatesService.list(db, user, query),
);

/** POST /api/v1/estimates — numbered EST-000001…; with requestId it moves that request to Estimated. */
export const POST = route({ roles: OPS, body: estimateSchema }, async ({ db, user, body }) =>
  ok(await estimatesService.create(db, user, body), "Estimate created.", 201),
);
