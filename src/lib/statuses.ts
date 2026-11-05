import type { Priority, WorkOrderStatus } from "@prisma/client";

/** Work orders still being worked on (they block deleting the customer, site or asset they point at). */
export const OPEN_WORK_ORDER_STATUSES: WorkOrderStatus[] = ["NEW", "SCHEDULED", "DISPATCHED", "IN_PROGRESS", "ON_HOLD"];

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  NEW: "New",
  SCHEDULED: "Scheduled",
  DISPATCHED: "Dispatched",
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const PRIORITY_LABEL: Record<Priority, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
