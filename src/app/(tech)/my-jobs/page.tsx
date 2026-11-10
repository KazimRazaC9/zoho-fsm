import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, ChevronRight, MapPin } from "lucide-react";
import { PriorityText, WorkOrderStatusBadge } from "@/components/domain/badges";
import { Card, CardContent } from "@/components/ui/card";
import { dbFor, requireRole, requireUser } from "@/lib/auth";
import { fieldService, type FieldJob } from "@/modules/field";

export const metadata: Metadata = { title: "My jobs" };

const dayLabel = (day: string, today: string) => {
  if (day === today) return "Today";
  const d = new Date(`${day}T12:00:00Z`);
  const t = new Date(`${today}T12:00:00Z`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};

function JobCard({ job }: { job: FieldJob }) {
  return (
    <Link href={`/my-jobs/${job.workOrderId}`} className="block">
      <Card className="active:bg-muted/50 transition-colors">
        <CardContent className="flex items-start gap-3 py-4">
          <div className="w-14 shrink-0 text-center">
            <p className="text-base leading-tight font-semibold">{job.startTime}</p>
            <p className="text-muted-foreground text-xs">{job.endTime}</p>
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground font-mono text-xs">{job.number}</span>
              <WorkOrderStatusBadge status={job.status} />
              <PriorityText priority={job.priority} />
            </div>
            <p className="leading-snug font-medium">{job.title}</p>
            <p className="text-muted-foreground text-sm">{job.customerName}</p>
            {job.siteLabel && (
              <p className="text-muted-foreground flex items-start gap-1 text-xs">
                <MapPin className="mt-0.5 size-3 shrink-0" />
                <span className="line-clamp-2">{job.siteLabel}</span>
              </p>
            )}
          </div>
          <ChevronRight className="text-muted-foreground mt-1 size-5 shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function MyJobsPage() {
  const user = await requireUser();
  requireRole(user, ["TECHNICIAN"]);
  const { today, jobs } = await fieldService.myJobs(dbFor(user), user);

  const finished = (j: FieldJob) => j.status === "COMPLETED" || j.status === "CANCELLED";
  const open = jobs.filter((j) => !finished(j));
  const carried = open.filter((j) => j.day < today);
  const upcoming = open.filter((j) => j.day >= today);
  const done = jobs.filter(finished).reverse();
  const days = [...new Set(upcoming.map((j) => j.day))];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">My jobs</h1>
        <p className="text-muted-foreground text-sm">
          {open.length === 0
            ? "Nothing assigned right now."
            : `${upcoming.filter((j) => j.day === today).length} today · ${open.length} open in total`}
        </p>
      </div>

      {jobs.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
            <CalendarCheck className="size-8" />
            Your dispatcher has not assigned you any jobs yet.
          </CardContent>
        </Card>
      )}

      {carried.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-red-600">Carried over</h2>
          {carried.map((j) => (
            <JobCard key={j.workOrderId} job={j} />
          ))}
        </section>
      )}

      {days.map((day) => (
        <section key={day} className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-semibold">{dayLabel(day, today)}</h2>
          {upcoming
            .filter((j) => j.day === day)
            .map((j) => (
              <JobCard key={j.workOrderId} job={j} />
            ))}
        </section>
      ))}

      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-semibold">Recently finished</h2>
          {done.map((j) => (
            <JobCard key={j.workOrderId} job={j} />
          ))}
        </section>
      )}
    </div>
  );
}
