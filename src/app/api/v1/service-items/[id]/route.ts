import { ok, route } from "@/lib/api";
import { catalogService, serviceItemSchema } from "@/modules/catalog";

/** GET /api/v1/service-items/{id} */
export const GET = route({ roles: ["ADMIN", "DISPATCHER"] }, ({ db, params }) => catalogService.get(db, params.id));

/** PUT /api/v1/service-items/{id} */
export const PUT = route({ roles: ["ADMIN"], body: serviceItemSchema }, ({ db, params, body }) =>
  catalogService.update(db, params.id, body),
);

/** DELETE /api/v1/service-items/{id} — soft delete. */
export const DELETE = route({ roles: ["ADMIN"] }, async ({ db, params }) => {
  await catalogService.remove(db, params.id);
  return ok(null, "Item deleted.");
});
