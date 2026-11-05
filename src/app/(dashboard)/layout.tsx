import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { dbFor, getCurrentUser } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Live account check: a deactivated user / disabled company is signed out right away.
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/end");

  const company = user.companyId
    ? await dbFor(user).company.findUnique({ where: { id: user.companyId }, select: { name: true } })
    : null;

  return (
    <AppShell user={{ name: user.fullName, email: user.email, role: user.role, companyName: company?.name ?? null }}>
      {children}
    </AppShell>
  );
}
