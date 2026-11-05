import { ok, route } from "@/lib/api";
import { authService, changePasswordSchema } from "@/modules/auth";

/** POST /api/v1/auth/change-password — also revokes every refresh token of the user. */
export const POST = route({ body: changePasswordSchema, rateLimitPerMinute: 10 }, async ({ body, user }) => {
  await authService.changePassword(user.id, body);
  return ok(null, "Password changed. Other devices were signed out.");
});
