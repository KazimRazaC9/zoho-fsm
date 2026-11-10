import { ok, route } from "@/lib/api";
import { convertEstimateSchema, estimatesService } from "@/modules/estimates";

/** POST /api/v1/estimates/{id}/convert — approved estimate → work order (once), lines copied. */
export const POST = route(
  { roles: ["ADMIN", "DISPATCHER"], body: convertEstimateSchema },
  async ({ db, user, params, body }) =>
    ok(await estimatesService.convert(db, user, params.id, body), "Converted to a work order.", 201),
);
