import { ok, route } from "@/lib/api";
import { estimatesService } from "@/modules/estimates";
import { lineSchema } from "@/modules/work-orders";

/** POST /api/v1/estimates/{id}/lines — drafts only; totals are recalculated on the server. */
export const POST = route({ roles: ["ADMIN", "DISPATCHER"], body: lineSchema }, async ({ db, user, params, body }) => {
  await estimatesService.addLine(db, user, params.id, body);
  return ok(await estimatesService.get(db, user, params.id), "Line added.", 201);
});
