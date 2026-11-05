import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { authService, loginSchema } from "@/modules/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(raw, request) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;

        try {
          rateLimit({ key: `login:${clientIp(request.headers)}`, limit: 10, windowMs: 60_000 });
        } catch {
          throw new RateLimitedSignin();
        }

        const user = await authService.verifyCredentials(parsed.data.email, parsed.data.password);
        if (!user) return null;
        return {
          id: user.id,
          name: user.fullName,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          companyId: user.companyId,
          companyName: user.companyName,
          timeZone: user.timeZone,
          currency: user.currency,
        };
      },
    }),
  ],
});
