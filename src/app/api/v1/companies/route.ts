import { z } from "zod";
import { ok, route } from "@/lib/api";
import { companiesService, createCompanySchema } from "@/modules/companies";

/** GET /api/v1/companies?search= — Super Admin: all tenants. */
export const GET = route(
  { roles: ["SUPER_ADMIN"], query: z.object({ search: z.string().trim().max(200).optional() }) },
  ({ db, user, query }) => companiesService.list(db, user, query.search),
);

/** POST /api/v1/companies — Super Admin: create a tenant together with its first Admin. */
export const POST = route({ roles: ["SUPER_ADMIN"], body: createCompanySchema }, async ({ db, user, body }) =>
  ok(await companiesService.create(db, user, body), "Company created.", 201),
);
