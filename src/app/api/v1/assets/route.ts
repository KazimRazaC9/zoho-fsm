import { ok, route } from "@/lib/api";
import { assetListQuerySchema, assetSchema, assetsService } from "@/modules/assets";
import { companiesService } from "@/modules/companies";

const OPS = ["ADMIN", "DISPATCHER"] as const;

/** GET /api/v1/assets?page&pageSize&search&status&warranty&customerId&sortBy&sortDir */
export const GET = route({ roles: OPS, query: assetListQuerySchema }, async ({ db, user, query }) => {
  const { timeZone } = await companiesService.getSettings(db, user);
  return assetsService.list(db, query, timeZone);
});

/** POST /api/v1/assets */
export const POST = route({ roles: OPS, body: assetSchema }, async ({ db, user, body }) => {
  const { timeZone } = await companiesService.getSettings(db, user);
  return ok(await assetsService.create(db, user, body, timeZone), "Asset created.", 201);
});
