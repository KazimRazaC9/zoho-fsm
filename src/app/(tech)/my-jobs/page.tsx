import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { dbFor, requireUser } from "@/lib/auth";
import { formatIn } from "@/lib/tz";

export const metadata: Metadata = { title: "My jobs" };

/**
 * Phase 0 view of the technician's upcoming appointments (read-only).
 * The full job flow — check-in, checklist, photos, signature — arrives in Phase 5.
 */
export default async function MyJobsPage() {
  const user = await requireUser();
  const db = dbFor(user);
  const company = user.companyId ? await db.company.findUnique({ where: { id: user.companyId } }) : null;
  const tz = company?.timeZone ?? "UTC";

  const appointments = await db.appointment.findMany({
    where: { technicianId: user.id, status: { not: "CANCELLED" } },
    orderBy: { scheduledStart: "asc" },
    take: 20,
    include: { workOrder: { include: { customer: true, address: true } } },
  });

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">My jobs</h1>
      {appointments.length === 0 && <p className="text-muted-foreground text-sm">No jobs assigned to you yet.</p>}
      {appointments.map((a) => (
        <Card key={a.id}>
          <CardContent className="space-y-1 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{a.workOrder.number}</span>
              <Badge variant="secondary">{a.status.replace("_", " ").toLowerCase()}</Badge>
            </div>
            <p className="font-medium">{a.workOrder.title}</p>
            <p className="text-muted-foreground text-sm">
              {a.workOrder.customer.name}
              {a.workOrder.address ? ` · ${a.workOrder.address.addressLine}` : ""}
            </p>
            <p className="text-sm">
              {formatIn(a.scheduledStart, tz, "EEE dd MMM, HH:mm")} – {formatIn(a.scheduledEnd, tz, "HH:mm")}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
