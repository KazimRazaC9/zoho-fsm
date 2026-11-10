import { route } from "@/lib/api";
import { fieldService } from "@/modules/field";

/** GET /api/v1/field/jobs — the signed-in technician's visits (open ones plus the last 3 days). */
export const GET = route({ roles: ["TECHNICIAN"] }, ({ db, user }) => fieldService.myJobs(db, user));
