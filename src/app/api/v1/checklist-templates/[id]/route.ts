import { ok, route } from "@/lib/api";
import { checklistsService, checklistTemplateSchema } from "@/modules/checklists";

/** GET /api/v1/checklist-templates/{id} */
export const GET = route({ roles: ["ADMIN", "DISPATCHER"] }, ({ db, params }) => checklistsService.get(db, params.id));

/** PUT /api/v1/checklist-templates/{id} — replaces the items. */
export const PUT = route({ roles: ["ADMIN"], body: checklistTemplateSchema }, ({ db, user, params, body }) =>
  checklistsService.update(db, user, params.id, body),
);

/** DELETE /api/v1/checklist-templates/{id} */
export const DELETE = route({ roles: ["ADMIN"] }, async ({ db, params }) => {
  await checklistsService.remove(db, params.id);
  return ok(null, "Template deleted.");
});
