import { route } from "@/lib/api";
import { companiesService, companySettingsSchema, setCompanyActiveSchema } from "@/modules/companies";

/** GET /api/v1/companies/{id} — Super Admin. */
export const GET = route({ roles: ["SUPER_ADMIN"] }, ({ db, user, params }) =>
  companiesService.get(db, user, params.id),
);

/** PUT /api/v1/companies/{id} — Super Admin edits a tenant's profile and settings. */
export const PUT = route({ roles: ["SUPER_ADMIN"], body: companySettingsSchema }, ({ db, user, params, body }) =>
  companiesService.update(db, user, params.id, body),
);

/** PATCH /api/v1/companies/{id} — { isActive }: disable / enable a tenant (disabling signs everyone out). */
export const PATCH = route({ roles: ["SUPER_ADMIN"], body: setCompanyActiveSchema }, ({ db, user, params, body }) =>
  companiesService.setActive(db, user, params.id, body.isActive),
);
