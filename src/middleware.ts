import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

/** Page guard: signed-in check + role-based routing (see authConfig.callbacks.authorized). */
const authMiddleware = NextAuth(authConfig).auth;

export default authMiddleware((request) => {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  // API routes authenticate themselves (session cookie or bearer token).
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sw.js|offline.html|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|webmanifest)$).*)",
  ],
};
