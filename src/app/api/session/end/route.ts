import { signOut } from "@/auth";

/**
 * GET /api/session/end — clears the session cookie and goes to /login. Layouts send users here when
 * their account was deactivated (or their company disabled) after they signed in.
 */
export async function GET() {
  await signOut({ redirectTo: "/login?reason=inactive" });
}
