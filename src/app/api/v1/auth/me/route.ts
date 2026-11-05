import { route } from "@/lib/api";
import { authService } from "@/modules/auth";

/** GET /api/v1/auth/me — the signed-in user (bearer token or session cookie). */
export const GET = route({}, ({ user }) => authService.getMe(user.id));
