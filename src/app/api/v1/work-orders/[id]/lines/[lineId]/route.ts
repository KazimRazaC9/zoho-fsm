import { route } from "@/lib/api";
import { lineSchema, workOrdersService } from "@/modules/work-orders";

const OPS = ["ADMIN", "DISPATCHER"] as const;

/** PUT /api/v1/work-orders/{id}/lines/{lineId} */
export const PUT = route({ roles: OPS, body: lineSchema }, async ({ db, user, params, body }) => {
  await workOrdersService.updateLine(db, params.id, params.lineId, body);
  return workOrdersService.get(db, user, params.id);
});

/** DELETE /api/v1/work-orders/{id}/lines/{lineId} */
export const DELETE = route({ roles: OPS }, async ({ db, user, params }) => {
  await workOrdersService.removeLine(db, params.id, params.lineId);
  return workOrdersService.get(db, user, params.id);
});
