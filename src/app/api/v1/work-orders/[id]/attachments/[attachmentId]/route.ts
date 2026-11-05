import { ok, route } from "@/lib/api";
import { workOrdersService } from "@/modules/work-orders";

/** DELETE /api/v1/work-orders/{id}/attachments/{attachmentId} */
export const DELETE = route({ roles: ["ADMIN", "DISPATCHER"] }, async ({ db, params }) => {
  await workOrdersService.removeAttachment(db, params.id, params.attachmentId);
  return ok(null, "File deleted.");
});
