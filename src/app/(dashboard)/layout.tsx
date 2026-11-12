import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { dbFor, getCurrentUser } from "@/lib/auth";
import { hasPermission, homeForPermissions, permissionForPage } from "@/lib/permissions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Live account check: a deactivated user / disabled company is signed out right away.
  const user = await getCurrentUser();
  if (!user) redirect("/api/session/end?reason=inactive");
  const pathname = (await headers()).get("x-pathname") ?? "";
  const permission = permissionForPage(pathname);
  if (
    user.customRoleId &&
    (pathname === "/roles" || (permission !== null && !hasPermission(user.permissions, permission)))
  ) {
    redirect(homeForPermissions(user.role, user.permissions));
  }

  const company = user.companyId
    ? await dbFor(user).company.findUnique({ where: { id: user.companyId }, select: { name: true } })
    : null;

  return (
    <AppShell
      user={{
        name: user.fullName,
        email: user.email,
        role: user.role,
        customRoleId: user.customRoleId,
        customRoleName: user.customRoleName,
        permissions: user.permissions,
        companyName: company?.name ?? null,
      }}
    >
      {children}
    </AppShell>
  );
}
