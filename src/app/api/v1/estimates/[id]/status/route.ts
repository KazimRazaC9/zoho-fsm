import { route } from "@/lib/api";
import { estimateStatusSchema, estimatesService } from "@/modules/estimates";

/** POST /api/v1/estimates/{id}/status { status: SENT|APPROVED|REJECTED|DRAFT } — 409 for moves that are not allowed. */
export const POST = route(
  { roles: ["ADMIN", "DISPATCHER"], body: estimateStatusSchema },
  ({ db, user, params, body }) => estimatesService.changeStatus(db, user, params.id, body.status),
);
