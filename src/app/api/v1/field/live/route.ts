import { route } from "@/lib/api";
import { fieldService } from "@/modules/field";

/** GET /api/v1/field/live — every active technician with their latest position and current job. */
export const GET = route({ roles: ["ADMIN", "DISPATCHER"] }, ({ db }) => fieldService.live(db));
