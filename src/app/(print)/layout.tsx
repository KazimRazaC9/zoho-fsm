import { redirect } from "next/navigation";
import { PrintBar } from "./print-bar";
import { auth } from "@/auth";
import { getCurrentUser } from "@/lib/auth";

/** Bare paper frame for printable documents: always light, with a Print button that is hidden on paper. */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await getCurrentUser())) redirect("/api/session/end?reason=inactive");
  return (
    <div className="min-h-svh bg-neutral-100 py-6 print:bg-white print:py-0">
      <PrintBar />
      {children}
    </div>
  );
}
