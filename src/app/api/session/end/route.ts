import { signOut } from "@/auth";

/**
 * GET /api/session/end — clears the session cookie and goes to /login. Layouts mark inactive
 * accounts explicitly so manual sign-outs do not show the deactivation message.
 */
export async function GET(request: Request) {
  const reason = new URL(request.url).searchParams.get("reason");
  await signOut({ redirectTo: reason === "inactive" ? "/login?reason=inactive" : "/login" });
}
