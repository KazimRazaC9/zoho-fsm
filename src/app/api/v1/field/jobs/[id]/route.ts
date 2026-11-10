import { route } from "@/lib/api";
import { fieldService } from "@/modules/field";

/** GET /api/v1/field/jobs/{id} — one of my jobs (404 if it is not assigned to me). */
export const GET = route({ roles: ["TECHNICIAN"] }, ({ db, user, params }) => fieldService.job(db, user, params.id));
