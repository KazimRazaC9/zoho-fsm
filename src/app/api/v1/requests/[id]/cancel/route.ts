import { route } from "@/lib/api";
import { requestsService } from "@/modules/requests";

/** POST /api/v1/requests/{id}/cancel */
export const POST = route({ roles: ["ADMIN", "DISPATCHER"] }, ({ db, user, params }) =>
  requestsService.cancel(db, user, params.id),
);
