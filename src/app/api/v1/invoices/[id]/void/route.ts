import { route } from "@/lib/api";
import { invoicesService } from "@/modules/invoices";

/** POST /api/v1/invoices/{id}/void — only while no payment is recorded. Admin. */
export const POST = route({ roles: ["ADMIN"] }, ({ db, user, params }) => invoicesService.void(db, user, params.id));
