import { ok, route } from "@/lib/api";
import { noteSchema, workOrdersService } from "@/modules/work-orders";

/** POST /api/v1/work-orders/{id}/notes { text, isInternal } */
export const POST = route({ roles: ["ADMIN", "DISPATCHER"], body: noteSchema }, async ({ db, user, params, body }) => {
  await workOrdersService.addNote(db, user, params.id, body);
  return ok(null, "Note added.", 201);
});
