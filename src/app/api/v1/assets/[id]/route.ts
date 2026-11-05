import { ok, route } from "@/lib/api";
import { assetSchema, assetsService } from "@/modules/assets";
import { companiesService } from "@/modules/companies";

const OPS = ["ADMIN", "DISPATCHER"] as const;

/** GET /api/v1/assets/{id} — includes warranty state and last service date. */
export const GET = route({ roles: OPS }, async ({ db, user, params }) => {
  const { timeZone } = await companiesService.getSettings(db, user);
  return assetsService.get(db, params.id, timeZone);
});

/** PUT /api/v1/assets/{id} */
export const PUT = route({ roles: OPS, body: assetSchema }, async ({ db, user, params, body }) => {
  const { timeZone } = await companiesService.getSettings(db, user);
  return assetsService.update(db, params.id, body, timeZone);
});

/** DELETE /api/v1/assets/{id} — Admin; 409 while work orders are open. */
export const DELETE = route({ roles: ["ADMIN"] }, async ({ db, params }) => {
  await assetsService.remove(db, params.id);
  return ok(null, "Asset deleted.");
});
