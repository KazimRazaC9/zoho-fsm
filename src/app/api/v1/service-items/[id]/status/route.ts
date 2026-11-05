import { route } from "@/lib/api";
import { catalogService, setItemActiveSchema } from "@/modules/catalog";

/** PATCH /api/v1/service-items/{id}/status { isActive } */
export const PATCH = route({ roles: ["ADMIN"], body: setItemActiveSchema }, ({ db, params, body }) =>
  catalogService.setActive(db, params.id, body.isActive),
);
