import { publicRoute } from "@/lib/api";
import { authService, loginSchema } from "@/modules/auth";

/** POST /api/v1/auth/token — email + password → bearer access token + refresh token (mobile/API clients). */
export const POST = publicRoute({ body: loginSchema, rateLimitPerMinute: 10 }, ({ body, ip }) =>
  authService.loginForTokens(body.email, body.password, ip),
);
