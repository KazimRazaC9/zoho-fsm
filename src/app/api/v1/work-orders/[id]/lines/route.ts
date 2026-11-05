import { ok, route } from "@/lib/api";
import { lineSchema, workOrdersService } from "@/modules/work-orders";

/** POST /api/v1/work-orders/{id}/lines */
export const POST = route({ roles: ["ADMIN", "DISPATCHER"], body: lineSchema }, async ({ db, user, params, body }) => {
  await workOrdersService.addLine(db, user, params.id, body);
  return ok(await workOrdersService.get(db, user, params.id), "Line added.", 201);
});
