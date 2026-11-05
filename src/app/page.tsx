import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { homeFor } from "@/lib/roles";

/** "/" forwards to the signed-in role's home (middleware does the same; this covers direct renders). */
export default async function Home() {
  const session = await auth();
  redirect(session?.user ? homeFor(session.user.role) : "/login");
}
