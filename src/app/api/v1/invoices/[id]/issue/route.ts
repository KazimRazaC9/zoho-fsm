import { route } from "@/lib/api";
import { invoicesService } from "@/modules/invoices";

/** POST /api/v1/invoices/{id}/issue — Draft → Issued (amounts lock; payments can be recorded). Admin. */
export const POST = route({ roles: ["ADMIN"] }, ({ db, user, params }) => invoicesService.issue(db, user, params.id));
