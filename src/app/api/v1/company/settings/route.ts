import { route } from "@/lib/api";
import { companiesService, companySettingsSchema } from "@/modules/companies";

/** GET /api/v1/company/settings — the caller's company. */
export const GET = route({ roles: ["ADMIN", "DISPATCHER", "TECHNICIAN"] }, ({ db, user }) =>
  companiesService.getSettings(db, user),
);

/** PUT /api/v1/company/settings — Admin updates profile, time zone, currency, tax. */
export const PUT = route({ roles: ["ADMIN"], body: companySettingsSchema }, ({ db, user, body }) =>
  companiesService.updateSettings(db, user, body),
);
