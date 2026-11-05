import { route } from "@/lib/api";
import { setUserActiveSchema, usersService } from "@/modules/users";

/** PATCH /api/v1/users/{id}/status — { isActive }: deactivate / reactivate. */
export const PATCH = route({ roles: ["ADMIN"], body: setUserActiveSchema }, ({ db, user, params, body }) =>
  usersService.setActive(db, user, params.id, body.isActive),
);
