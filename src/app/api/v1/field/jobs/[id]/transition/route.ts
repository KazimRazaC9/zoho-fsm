import { route } from "@/lib/api";
import { fieldService, transitionSchema } from "@/modules/field";

/** POST /api/v1/field/jobs/{id}/transition { action: on-my-way|start|hold|resume|complete, reason?, location? } */
export const POST = route({ roles: ["TECHNICIAN"], body: transitionSchema }, ({ db, user, params, body }) =>
  fieldService.transition(db, user, params.id, body),
);
