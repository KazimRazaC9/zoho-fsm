import { ok, route } from "@/lib/api";
import { estimateSchema, estimatesService } from "@/modules/estimates";

const OPS = ["ADMIN", "DISPATCHER"] as const;

/** GET /api/v1/estimates/{id} */
export const GET = route({ roles: OPS }, ({ db, user, params }) => estimatesService.get(db, user, params.id));

/** PUT /api/v1/estimates/{id} — drafts only. */
export const PUT = route({ roles: OPS, body: estimateSchema }, ({ db, user, params, body }) =>
  estimatesService.update(db, user, params.id, body),
);

/** DELETE /api/v1/estimates/{id} — drafts only. */
export const DELETE = route({ roles: OPS }, async ({ db, params }) => {
  await estimatesService.remove(db, params.id);
  return ok(null, "Estimate deleted.");
});
