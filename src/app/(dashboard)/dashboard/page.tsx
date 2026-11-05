import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dbFor, requireUser } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/roles";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Phase 0 dashboard: proves the tenant-scoped data path end to end. Every number below is read
 * through the tenant client, so a user only ever sees their own company's records.
 * Full KPIs and charts arrive in Phase 8.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const db = dbFor(user);

  const [company, customers, workOrders, technicians] = await Promise.all([
    user.companyId ? db.company.findUnique({ where: { id: user.companyId } }) : null,
    db.customer.count(),
    db.workOrder.groupBy({ by: ["status"], _count: { _all: true } }),
    db.user.count({ where: { role: "TECHNICIAN", isActive: true } }),
  ]);
  const totalWo = workOrders.reduce((n, g) => n + g._count._all, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.fullName.split(" ")[0]}</h1>
        <p className="text-muted-foreground text-sm">
          {ROLE_LABEL[user.role]} · {company?.name} · {company?.timeZone} · {company?.currency}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Customers" value={customers} />
        <Stat label="Work orders" value={totalWo} />
        <Stat label="Active technicians" value={technicians} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Work orders by status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {workOrders.length === 0 && <p className="text-muted-foreground text-sm">No work orders yet.</p>}
          {workOrders
            .sort((a, b) => b._count._all - a._count._all)
            .map((g) => (
              <Badge key={g.status} variant="secondary" className="text-sm">
                {g.status.replace("_", " ").toLowerCase()} · {g._count._all}
              </Badge>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your modules</CardTitle>
          <CardDescription>Menu items available to your role and the phase that delivers each one.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {navFor(user.role).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="hover:bg-accent flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              {item.label}
              <Badge variant="outline">Phase {item.phase}</Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
