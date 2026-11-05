import { route } from "@/lib/api";
import { changeStatusSchema, workOrdersService } from "@/modules/work-orders";

/** POST /api/v1/work-orders/{id}/status { status, reason } — 409 with a clear message for moves the state machine refuses. */
export const POST = route({ roles: ["ADMIN", "DISPATCHER"], body: changeStatusSchema }, ({ db, user, params, body }) =>
  workOrdersService.changeStatus(db, user, params.id, body),
);
