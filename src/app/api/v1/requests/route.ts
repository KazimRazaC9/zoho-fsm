import { ok, route } from "@/lib/api";
import { requestListQuerySchema, requestSchema, requestsService } from "@/modules/requests";

const OPS = ["ADMIN", "DISPATCHER"] as const;

/** GET /api/v1/requests?status=open|all|NEW|ESTIMATED|CONVERTED|CANCELLED&source&priority&search */
export const GET = route({ roles: OPS, query: requestListQuerySchema }, ({ db, user, query }) =>
  requestsService.list(db, user, query),
);

/** POST /api/v1/requests — numbered SR-000001… */
export const POST = route({ roles: OPS, body: requestSchema }, async ({ db, user, body }) =>
  ok(await requestsService.create(db, user, body), "Service request created.", 201),
);
