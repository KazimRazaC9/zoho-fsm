import { route } from "@/lib/api";
import { assetsService } from "@/modules/assets";

/** GET /api/v1/assets/{id}/history — service history (work orders on this asset), newest first. */
export const GET = route({ roles: ["ADMIN", "DISPATCHER"] }, ({ db, params }) => assetsService.history(db, params.id));
