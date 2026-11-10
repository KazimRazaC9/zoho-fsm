import type { Priority, WorkOrderStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { PRIORITY_LABEL, WORK_ORDER_STATUS_LABEL } from "@/lib/statuses";
import { cn } from "@/lib/utils";
import {
  ASSET_STATUS_LABEL,
  WARRANTY_LABEL,
  type AssetStatus,
  type WarrantyState,
} from "@/modules/assets/assets.schema";

const tone = {
  green: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  red: "border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  blue: "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  gray: "border-transparent bg-muted text-muted-foreground",
} as const;

export function WarrantyBadge({ state, className }: { state: WarrantyState; className?: string }) {
  const t = { active: tone.green, expiring: tone.amber, expired: tone.red, none: tone.gray }[state];
  return (
    <Badge variant="outline" className={cn(t, className)}>
      {WARRANTY_LABEL[state]}
    </Badge>
  );
}

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const t = { ACTIVE: tone.green, IN_REPAIR: tone.amber, RETIRED: tone.gray }[status];
  return (
    <Badge variant="outline" className={t}>
      {ASSET_STATUS_LABEL[status]}
    </Badge>
  );
}

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  const t = {
    NEW: tone.blue,
    SCHEDULED: tone.blue,
    DISPATCHED: tone.blue,
    IN_PROGRESS: tone.amber,
    ON_HOLD: tone.amber,
    COMPLETED: tone.green,
    CANCELLED: tone.gray,
  }[status];
  return (
    <Badge variant="outline" className={t}>
      {WORK_ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}

export function PriorityText({ priority }: { priority: Priority }) {
  return (
    <span className={cn("text-xs font-medium", priority === "HIGH" ? "text-red-600" : "text-muted-foreground")}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function EstimateStatusBadge({ status }: { status: import("@prisma/client").EstimateStatus }) {
  const t = { DRAFT: tone.gray, SENT: tone.blue, APPROVED: tone.green, REJECTED: tone.red }[status];
  const label = { DRAFT: "Draft", SENT: "Sent", APPROVED: "Approved", REJECTED: "Rejected" }[status];
  return (
    <Badge variant="outline" className={t}>
      {label}
    </Badge>
  );
}

export function InvoiceStatusBadge({ status }: { status: import("@prisma/client").InvoiceStatus }) {
  const t = {
    DRAFT: tone.gray,
    SENT: tone.blue,
    PARTIALLY_PAID: tone.amber,
    PAID: tone.green,
    OVERDUE: tone.red,
    VOID: tone.gray,
  }[status];
  const label = {
    DRAFT: "Draft",
    SENT: "Issued",
    PARTIALLY_PAID: "Partially paid",
    PAID: "Paid",
    OVERDUE: "Overdue",
    VOID: "Void",
  }[status];
  return (
    <Badge variant="outline" className={t}>
      {label}
    </Badge>
  );
}
