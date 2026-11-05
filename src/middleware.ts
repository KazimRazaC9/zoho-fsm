import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/** Page guard: signed-in check + role-based routing (see authConfig.callbacks.authorized). */
export default NextAuth(authConfig).auth;

export const config = {
  // API routes authenticate themselves (session cookie or bearer token).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|webmanifest)$).*)"],
};
