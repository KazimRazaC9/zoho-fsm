import { publicRoute } from "@/lib/api";
import { authService, refreshSchema } from "@/modules/auth";

/** POST /api/v1/auth/refresh — rotates the refresh token; reusing an old one revokes all sessions. */
export const POST = publicRoute({ body: refreshSchema, rateLimitPerMinute: 30 }, ({ body, ip }) =>
  authService.refresh(body.refreshToken, ip),
);
