import { ok, route } from "@/lib/api";
import { estimatesService } from "@/modules/estimates";
import { lineSchema } from "@/modules/work-orders";

const OPS = ["ADMIN", "DISPATCHER"] as const;

/** PUT /api/v1/estimates/{id}/lines/{lineId} */
export const PUT = route({ roles: OPS, body: lineSchema }, async ({ db, user, params, body }) => {
  await estimatesService.updateLine(db, params.id, params.lineId, body);
  return ok(await estimatesService.get(db, user, params.id), "Line saved.");
});

/** DELETE /api/v1/estimates/{id}/lines/{lineId} */
export const DELETE = route({ roles: OPS }, async ({ db, user, params }) => {
  await estimatesService.removeLine(db, params.id, params.lineId);
  return ok(await estimatesService.get(db, user, params.id), "Line removed.");
});
