import { route } from "@/lib/api";
import { catalogService, stockAdjustSchema } from "@/modules/catalog";

/** POST /api/v1/service-items/{id}/stock { delta } — receive (+) or write off (-); 409 if stock would go below zero. */
export const POST = route({ roles: ["ADMIN"], body: stockAdjustSchema }, ({ db, params, body }) =>
  catalogService.adjustStock(db, params.id, body.delta),
);
