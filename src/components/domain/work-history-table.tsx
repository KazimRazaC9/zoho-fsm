import Link from "next/link";
import { PriorityText, WorkOrderStatusBadge } from "./badges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIn } from "@/lib/tz";
import type { WorkHistoryItem } from "@/lib/work-history";

/** Service history table; each row opens its work order. */
export function WorkHistoryTable({
  items,
  timeZone,
  showAsset = true,
  empty = "No work orders yet.",
}: {
  items: WorkHistoryItem[];
  timeZone: string;
  showAsset?: boolean;
  empty?: string;
}) {
  if (items.length === 0) return <p className="text-muted-foreground py-6 text-center text-sm">{empty}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Number</TableHead>
          <TableHead>Job</TableHead>
          {showAsset && <TableHead className="hidden md:table-cell">Asset</TableHead>}
          <TableHead className="hidden sm:table-cell">Created</TableHead>
          <TableHead className="hidden lg:table-cell">Completed</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((w) => (
          <TableRow key={w.id} className="relative">
            <TableCell className="font-mono text-xs">{w.number}</TableCell>
            <TableCell>
              <Link href={`/work-orders/${w.id}`} className="font-medium after:absolute after:inset-0 hover:underline">
                {w.title}
              </Link>
              <p className="text-muted-foreground text-xs">
                <PriorityText priority={w.priority} />
                {w.siteLabel && <> · {w.siteLabel}</>}
              </p>
            </TableCell>
            {showAsset && (
              <TableCell className="text-muted-foreground hidden text-sm md:table-cell">{w.assetName ?? "—"}</TableCell>
            )}
            <TableCell className="text-muted-foreground hidden text-sm whitespace-nowrap sm:table-cell">
              {formatIn(new Date(w.createdAt), timeZone, "dd MMM yyyy")}
            </TableCell>
            <TableCell className="text-muted-foreground hidden text-sm whitespace-nowrap lg:table-cell">
              {w.completedAt ? formatIn(new Date(w.completedAt), timeZone, "dd MMM yyyy") : "—"}
            </TableCell>
            <TableCell>
              <WorkOrderStatusBadge status={w.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
