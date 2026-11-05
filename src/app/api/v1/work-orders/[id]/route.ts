import { ok, route } from "@/lib/api";
import { workOrderSchema, workOrdersService } from "@/modules/work-orders";

const OPS = ["ADMIN", "DISPATCHER"] as const;

/** GET /api/v1/work-orders/{id} — with lines, totals, checklist, notes, attachments and status timeline. */
export const GET = route({ roles: OPS }, ({ db, user, params }) => workOrdersService.get(db, user, params.id));

/** PUT /api/v1/work-orders/{id} — details; 409 when completed or cancelled. */
export const PUT = route({ roles: OPS, body: workOrderSchema }, ({ db, user, params, body }) =>
  workOrdersService.update(db, user, params.id, body),
);

/** DELETE /api/v1/work-orders/{id} — Admin; only New or Cancelled. */
export const DELETE = route({ roles: ["ADMIN"] }, async ({ db, params }) => {
  await workOrdersService.remove(db, params.id);
  return ok(null, "Work order deleted.");
});
