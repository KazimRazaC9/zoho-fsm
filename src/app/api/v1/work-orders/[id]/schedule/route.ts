import { ok, route } from "@/lib/api";
import { scheduleSchema, schedulingService } from "@/modules/scheduling";

const OPS = ["ADMIN", "DISPATCHER"] as const;

/** PUT /api/v1/work-orders/{id}/schedule { technicianId, start, durationMin } — assign or move the visit; 409 if the technician is double-booked. */
export const PUT = route({ roles: OPS, body: scheduleSchema }, ({ db, user, params, body }) =>
  schedulingService.schedule(db, user, params.id, body),
);

/** DELETE /api/v1/work-orders/{id}/schedule — take it off the board (Scheduled → New). */
export const DELETE = route({ roles: OPS }, async ({ db, user, params }) => {
  await schedulingService.unschedule(db, user, params.id);
  return ok(null, "Removed from the dispatch board.");
});
