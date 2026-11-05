import { ok, route } from "@/lib/api";
import { catalogService, serviceItemListQuerySchema, serviceItemSchema } from "@/modules/catalog";

/** GET /api/v1/service-items?page&pageSize&search&type&status&stock=low&sortBy&sortDir — dispatchers may read (pickers). */
export const GET = route({ roles: ["ADMIN", "DISPATCHER"], query: serviceItemListQuerySchema }, ({ db, query }) =>
  catalogService.list(db, query),
);

/** POST /api/v1/service-items — Admin. */
export const POST = route({ roles: ["ADMIN"], body: serviceItemSchema }, async ({ db, user, body }) =>
  ok(await catalogService.create(db, user, body), "Item created.", 201),
);
