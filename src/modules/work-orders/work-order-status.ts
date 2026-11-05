/**
 * The work order state machine — the ONE place that decides which status moves are allowed.
 * Pure (no database), so the server enforces it and the UI uses it to show only valid buttons.
 *
 *   NEW ──► SCHEDULED ──► DISPATCHED ──► IN_PROGRESS ──► COMPLETED
 *    │  ◄──     │    ◄──      │                │   ▲          │
 *    │          ▼             ▼                ▼   │          │ reopen (Admin)
 *    └──────► ON_HOLD ◄───────────────────────────┘          ▼
 *    any open status ──► CANCELLED ──reopen (Admin)──► NEW    IN_PROGRESS
 */
import type { WorkOrderStatus } from "@prisma/client";

export const WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  "NEW",
  "SCHEDULED",
  "DISPATCHED",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
];

/** Closed work orders are read-only until reopened. */
export const CLOSED_STATUSES: WorkOrderStatus[] = ["COMPLETED", "CANCELLED"];
export const isClosed = (s: WorkOrderStatus) => CLOSED_STATUSES.includes(s);

const TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  NEW: ["SCHEDULED", "ON_HOLD", "CANCELLED"],
  SCHEDULED: ["DISPATCHED", "NEW", "ON_HOLD", "CANCELLED"],
  DISPATCHED: ["IN_PROGRESS", "SCHEDULED", "ON_HOLD", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "ON_HOLD"],
  ON_HOLD: ["NEW", "SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: ["IN_PROGRESS"],
  CANCELLED: ["NEW"],
};

/** Moves out of a closed status ("reopen") are Admin-only. */
const ADMIN_ONLY = (from: WorkOrderStatus) => isClosed(from);

/** These moves must say why (shown on the timeline). */
export const REASON_REQUIRED = (from: WorkOrderStatus, to: WorkOrderStatus) =>
  to === "ON_HOLD" || to === "CANCELLED" || isClosed(from);

/** Button label for moving to `to` from `from`. */
export function transitionLabel(from: WorkOrderStatus, to: WorkOrderStatus): string {
  if (isClosed(from)) return "Reopen";
  if (from === "ON_HOLD")
    return to === "IN_PROGRESS" ? "Resume work" : to === "CANCELLED" ? "Cancel" : `Resume as ${STATUS_TEXT[to]}`;
  switch (to) {
    case "SCHEDULED":
      return from === "DISPATCHED" ? "Back to scheduled" : "Mark scheduled";
    case "NEW":
      return "Unschedule";
    case "DISPATCHED":
      return "Dispatch";
    case "IN_PROGRESS":
      return "Start work";
    case "ON_HOLD":
      return "Put on hold";
    case "COMPLETED":
      return "Complete";
    case "CANCELLED":
      return "Cancel";
  }
}

const STATUS_TEXT: Record<WorkOrderStatus, string> = {
  NEW: "new",
  SCHEDULED: "scheduled",
  DISPATCHED: "dispatched",
  IN_PROGRESS: "in progress",
  ON_HOLD: "on hold",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

/** Statuses `role` may move to from `from` (ignores data guards like the checklist). */
export function nextStatuses(from: WorkOrderStatus, role: string): WorkOrderStatus[] {
  if (ADMIN_ONLY(from) && role !== "ADMIN") return [];
  return TRANSITIONS[from];
}

export type TransitionContext = {
  role: string;
  reason?: string;
  /** Checklist items not yet ticked. */
  openChecklistItems: number;
  requireSignature: boolean;
  hasSignature: boolean;
};

/** Why `from → to` is not allowed, or null when it is. Messages are shown to the user as-is. */
export function transitionError(from: WorkOrderStatus, to: WorkOrderStatus, ctx: TransitionContext): string | null {
  if (from === to) return `The work order is already ${STATUS_TEXT[to]}.`;
  if (!TRANSITIONS[from].includes(to)) {
    const allowed = TRANSITIONS[from].map((s) => STATUS_TEXT[s]).join(", ");
    return `A ${STATUS_TEXT[from]} work order cannot be moved to ${STATUS_TEXT[to]}. Allowed: ${allowed}.`;
  }
  if (ADMIN_ONLY(from) && ctx.role !== "ADMIN") return "Only an Admin can reopen a closed work order.";
  if (REASON_REQUIRED(from, to) && !ctx.reason?.trim()) return "Please give a reason for this change.";
  if (to === "COMPLETED") {
    if (ctx.openChecklistItems > 0) {
      const n = ctx.openChecklistItems;
      return `Finish the checklist first: ${n} item${n === 1 ? " is" : "s are"} not done.`;
    }
    if (ctx.requireSignature && !ctx.hasSignature) return "A customer signature is required before completing.";
  }
  return null;
}
