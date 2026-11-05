import { ok, route } from "@/lib/api";
import { resetPasswordSchema, usersService } from "@/modules/users";

/** POST /api/v1/users/{id}/reset-password — { password }: Admin sets a new password; the user is signed out. */
export const POST = route(
  { roles: ["ADMIN"], body: resetPasswordSchema, rateLimitPerMinute: 20 },
  async ({ db, user, params, body }) => {
    await usersService.resetPassword(db, user, params.id, body.password);
    return ok(null, "Password reset.");
  },
);
