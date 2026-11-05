import { ok, route } from "@/lib/api";
import { convertRequestSchema, requestsService } from "@/modules/requests";

/** POST /api/v1/requests/{id}/convert { checklistTemplateId, dueDate } → the new work order { id, number }. */
export const POST = route(
  { roles: ["ADMIN", "DISPATCHER"], body: convertRequestSchema },
  async ({ db, user, params, body }) =>
    ok(await requestsService.convert(db, user, params.id, body), "Converted to a work order.", 201),
);
