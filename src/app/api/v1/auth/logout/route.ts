import { ok, route } from "@/lib/api";
import { authService, logoutSchema } from "@/modules/auth";

/** POST /api/v1/auth/logout — revokes the given refresh token (only the owner's). */
export const POST = route({ body: logoutSchema }, async ({ body, user }) => {
  await authService.logout(body.refreshToken, user.id);
  return ok(null, "Signed out.");
});
