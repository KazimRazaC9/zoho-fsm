import type { NextAuthConfig } from "next-auth";
import { navItemFor } from "@/lib/nav";
import { homeFor, type AppRole } from "@/lib/roles";

/**
 * Edge-safe part of the Auth.js config (used by middleware): no database, no bcrypt.
 * The Credentials provider is added in src/auth.ts, which runs on Node.
 */
const PUBLIC_PATHS = ["/login"];

/** What the jwt callback stores in the session token. */
type TokenClaims = {
  uid: string;
  role: AppRole;
  companyId?: string | null;
  companyName?: string | null;
  timeZone?: string | null;
  currency?: string | null;
};

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  trustHost: true,
  providers: [],
  callbacks: {
    /** Route guard for every page (middleware). API routes check auth themselves. */
    authorized({ auth, request }) {
      const { pathname, search } = request.nextUrl;
      const user = auth?.user;
      const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

      if (!user) {
        if (isPublic) return true;
        const url = new URL("/login", request.nextUrl);
        if (pathname !== "/") url.searchParams.set("callbackUrl", pathname + search);
        return Response.redirect(url);
      }

      const role = user.role as AppRole;
      const home = new URL(homeFor(role), request.nextUrl);
      if (isPublic || pathname === "/") return Response.redirect(home);

      // A screen that belongs to another role → send the user to their own home.
      const item = navItemFor(pathname);
      if (item && !item.roles.includes(role)) return Response.redirect(home);
      // Technicians only use the field app.
      if (role === "TECHNICIAN" && !pathname.startsWith("/my-jobs") && !pathname.startsWith("/account")) {
        return Response.redirect(home);
      }
      return true;
    },

    jwt({ token, user }) {
      if (user) {
        token.uid = user.id as string;
        token.role = user.role;
        token.companyId = user.companyId;
        token.companyName = user.companyName;
        token.timeZone = user.timeZone;
        token.currency = user.currency;
      }
      return token;
    },

    session({ session, token }) {
      const t = token as typeof token & TokenClaims;
      session.user.id = t.uid;
      session.user.role = t.role;
      session.user.companyId = t.companyId ?? null;
      session.user.companyName = t.companyName ?? null;
      session.user.timeZone = t.timeZone ?? null;
      session.user.currency = t.currency ?? null;
      return session;
    },
  },
} satisfies NextAuthConfig;
