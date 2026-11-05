import { route } from "@/lib/api";
import { requestSchema, requestsService } from "@/modules/requests";

const OPS = ["ADMIN", "DISPATCHER"] as const;

/** GET /api/v1/requests/{id} */
export const GET = route({ roles: OPS }, ({ db, user, params }) => requestsService.get(db, user, params.id));

/** PUT /api/v1/requests/{id} — only while New or Estimated. */
export const PUT = route({ roles: OPS, body: requestSchema }, ({ db, user, params, body }) =>
  requestsService.update(db, user, params.id, body),
);
