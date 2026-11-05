import { ok, route } from "@/lib/api";
import { workOrdersService } from "@/modules/work-orders";

/** DELETE /api/v1/work-orders/{id}/notes/{noteId} — your own note, or any note as Admin. */
export const DELETE = route({ roles: ["ADMIN", "DISPATCHER"] }, async ({ db, user, params }) => {
  await workOrdersService.removeNote(db, user, params.id, params.noteId);
  return ok(null, "Note deleted.");
});
