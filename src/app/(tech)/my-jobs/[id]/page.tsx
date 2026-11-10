import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { JobView } from "./job-client";
import { dbFor, requireRole, requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { fieldService } from "@/modules/field";

export const metadata: Metadata = { title: "Job" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  requireRole(user, ["TECHNICIAN"]);
  const db = dbFor(user);
  const [job, parts] = await Promise.all([
    fieldService.job(db, user, id).catch((e) => {
      if (e instanceof NotFoundError) notFound();
      throw e;
    }),
    fieldService.partOptions(db),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/my-jobs" className="text-muted-foreground inline-flex items-center gap-1 text-sm">
        <ChevronLeft className="size-4" /> My jobs
      </Link>
      <JobView job={job} parts={parts} />
    </div>
  );
}
