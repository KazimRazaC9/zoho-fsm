import { ok, route } from "@/lib/api";
import { customersService, projectSchema } from "@/modules/customers";

const OPS = ["ADMIN", "DISPATCHER"] as const;

/** PUT /api/v1/customers/{id}/projects/{projectId} */
export const PUT = route({ roles: OPS, body: projectSchema }, ({ db, params, body }) =>
  customersService.updateProject(db, params.id, params.projectId, body),
);

/** DELETE /api/v1/customers/{id}/projects/{projectId} — 409 while the project still has sites. */
export const DELETE = route({ roles: OPS }, async ({ db, params }) => {
  await customersService.removeProject(db, params.id, params.projectId);
  return ok(null, "Project deleted.");
});
