import { ok, route } from "@/lib/api";
import { customersService, projectSchema } from "@/modules/customers";

/** POST /api/v1/customers/{id}/projects — add a project (409 when the name is taken). */
export const POST = route({ roles: ["ADMIN", "DISPATCHER"], body: projectSchema }, async ({ db, user, params, body }) =>
  ok(await customersService.addProject(db, user, params.id, body), "Project added.", 201),
);
