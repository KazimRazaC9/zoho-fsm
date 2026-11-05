import { ok, route } from "@/lib/api";
import { checklistsService, checklistTemplateSchema } from "@/modules/checklists";

/** GET /api/v1/checklist-templates */
export const GET = route({ roles: ["ADMIN", "DISPATCHER"] }, ({ db }) => checklistsService.list(db));

/** POST /api/v1/checklist-templates { name, items[], isActive } — Admin. */
export const POST = route({ roles: ["ADMIN"], body: checklistTemplateSchema }, async ({ db, user, body }) =>
  ok(await checklistsService.create(db, user, body), "Template created.", 201),
);
