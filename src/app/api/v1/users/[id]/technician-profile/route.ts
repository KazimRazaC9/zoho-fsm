import { route } from "@/lib/api";
import { technicianProfileSchema, usersService } from "@/modules/users";

/** PUT /api/v1/users/{id}/technician-profile — skills, hourly rate, working hours/days, colour. */
export const PUT = route({ roles: ["ADMIN"], body: technicianProfileSchema }, ({ db, user, params, body }) =>
  usersService.updateTechnicianProfile(db, user, params.id, body),
);
