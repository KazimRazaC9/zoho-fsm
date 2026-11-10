import { route } from "@/lib/api";
import { invoicesService } from "@/modules/invoices";

/** GET /api/v1/invoices/summary — outstanding, overdue and collected in the last 30 days. */
export const GET = route({ roles: ["ADMIN", "DISPATCHER"] }, ({ db, user }) => invoicesService.summary(db, user));
