import { ok, route } from "@/lib/api";
import { updateUserSchema, usersService } from "@/modules/users";

/** GET /api/v1/users/{id} */
export const GET = route({ roles: ["ADMIN", "DISPATCHER"] }, ({ db, params }) => usersService.get(db, params.id));

/** PUT /api/v1/users/{id} — name, email, phone, role. */
export const PUT = route({ roles: ["ADMIN"], body: updateUserSchema }, ({ db, user, params, body }) =>
  usersService.update(db, user, params.id, body),
);

/** DELETE /api/v1/users/{id} — soft delete (signs the user out everywhere). */
export const DELETE = route({ roles: ["ADMIN"] }, async ({ db, user, params }) => {
  await usersService.remove(db, user, params.id);
  return ok(null, "User deleted.");
});
