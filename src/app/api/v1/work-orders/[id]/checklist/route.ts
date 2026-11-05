import { z } from "zod";
import { ok, route } from "@/lib/api";
import { idParam } from "@/lib/validation";
import { workOrdersService } from "@/modules/work-orders";

const body = z.union([z.object({ templateId: idParam }), z.object({ text: z.string().trim().min(1).max(300) })]);

/** POST /api/v1/work-orders/{id}/checklist { templateId } (append a template) or { text } (one item). */
export const POST = route({ roles: ["ADMIN", "DISPATCHER"], body }, async ({ db, user, params, body }) => {
  if ("templateId" in body) await workOrdersService.applyTemplate(db, user, params.id, body.templateId);
  else await workOrdersService.addChecklistItem(db, user, params.id, body.text);
  return ok(await workOrdersService.get(db, user, params.id), "Checklist updated.", 201);
});
