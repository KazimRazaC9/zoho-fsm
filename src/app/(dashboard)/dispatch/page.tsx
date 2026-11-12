import type { Metadata } from "next";
import { DispatchBoard } from "./dispatch-board";
import { dbFor, requirePagePermission, requireRole, requireUser } from "@/lib/auth";
import { boardQuerySchema, schedulingService } from "@/modules/scheduling";

export const metadata: Metadata = { title: "Dispatch board" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DispatchPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireUser();
  requireRole(user, ["ADMIN", "DISPATCHER"]);
  requirePagePermission(user, "/dispatch");
  const { date } = boardQuerySchema.parse({ date: typeof sp.date === "string" ? sp.date : undefined });
  const board = await schedulingService.board(dbFor(user), user, date);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dispatch board</h1>
        <p className="text-muted-foreground text-sm">
          Assign jobs to technicians and time slots. Drag a job from the list onto a technician, or click an empty slot.
          Times are in {board.timeZone}.
        </p>
      </div>
      <DispatchBoard board={board} />
    </div>
  );
}
