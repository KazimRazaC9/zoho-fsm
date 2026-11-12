/**
 * The work order state machine — the ONE place that decides which status moves are allowed.
 * Pure (no database), so the server enforces it and the UI uses it to show only valid buttons.
 *
 *   NEW ──► SCHEDULED ──► DISPATCHED ──► IN_PROGRESS ──► COMPLETED ──► CLOSED
 *    │  ◄──     │    ◄──      │                │   ▲          │  (technician   (QA)
 *    │          ▼             ▼                ▼   │          │   is done)
 *    └──────► ON_HOLD ◄───────────────────────────┘          │ rework (QA, reason)
 *    any open status ──► CANCELLED ──reopen (Admin)──► NEW    ▼
 *    CLOSED ──reopen (Admin)──► IN_PROGRESS                IN_PROGRESS
 *
 * COMPLETED means "the technician finished"; only QA (Admin, Dispatcher or a role holding
 * "workOrders:close") may move it on to CLOSED or send it back.
 */
import type { WorkOrderStatus } from "@prisma/client";

export const WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  "NEW",
  "SCHEDULED",
  "DISPATCHED",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
];

/** Finished work orders are read-only; completed ones wait for QA, closed and cancelled need an Admin to reopen. */
export const CLOSED_STATUSES: WorkOrderStatus[] = ["COMPLETED", "CLOSED", "CANCELLED"];
export const isClosed = (s: WorkOrderStatus) => CLOSED_STATUSES.includes(s);

const TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  NEW: ["SCHEDULED", "ON_HOLD", "CANCELLED"],
  SCHEDULED: ["DISPATCHED", "NEW", "ON_HOLD", "CANCELLED"],
  DISPATCHED: ["IN_PROGRESS", "SCHEDULED", "ON_HOLD", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "ON_HOLD"],
  ON_HOLD: ["NEW", "SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: ["IN_PROGRESS"],
  CANCELLED: ["NEW"],
};

/** Reopening a closed or cancelled work order is Admin-only. */
const ADMIN_ONLY = (from: WorkOrderStatus) => from === "CLOSED" || from === "CANCELLED";

/** Verifying a completed work order (close it, or send it back) is QA's job. */
export const isQaMove = (from: WorkOrderStatus, to: WorkOrderStatus) =>
  from === "COMPLETED" && (to === "CLOSED" || to === "IN_PROGRESS");

/** These moves must say why (shown on the timeline). */
export const REASON_REQUIRED = (from: WorkOrderStatus, to: WorkOrderStatus) =>
  to === "ON_HOLD" || to === "CANCELLED" || ADMIN_ONLY(from) || (from === "COMPLETED" && to === "IN_PROGRESS");

/** Button label for moving to `to` from `from`. */
export function transitionLabel(from: WorkOrderStatus, to: WorkOrderStatus): string {
  if (ADMIN_ONLY(from)) return "Reopen";
  if (from === "COMPLETED") return to === "CLOSED" ? "Verify & close" : "Send back for rework";
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
    case "CLOSED":
      return "Verify & close";
    case "CANCELLED":
      return "Cancel";
  }
}

export const STATUS_TEXT: Record<WorkOrderStatus, string> = {
  NEW: "new",
  SCHEDULED: "scheduled",
  DISPATCHED: "dispatched",
  IN_PROGRESS: "in progress",
  ON_HOLD: "on hold",
  COMPLETED: "completed",
  CLOSED: "closed",
  CANCELLED: "cancelled",
};

/** Statuses `role` may move to from `from` (ignores data guards like the checklist). */
export function nextStatuses(from: WorkOrderStatus, role: string, qa = true): WorkOrderStatus[] {
  if (ADMIN_ONLY(from) && role !== "ADMIN") return [];
  if (from === "COMPLETED" && !qa) return [];
  return TRANSITIONS[from];
}

export type TransitionContext = {
  role: string;
  /** May verify (close or send back) a completed work order. */
  canQa: boolean;
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
  if (isQaMove(from, to) && !ctx.canQa) return "Only QA can verify a completed work order.";
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
