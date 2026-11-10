import { route } from "@/lib/api";
import { invoiceListQuerySchema, invoicesService } from "@/modules/invoices";

/** GET /api/v1/invoices?status=DRAFT|SENT|PARTIALLY_PAID|PAID|OVERDUE|VOID|open|all&search — OVERDUE is derived from the due date. */
export const GET = route({ roles: ["ADMIN", "DISPATCHER"], query: invoiceListQuerySchema }, ({ db, user, query }) =>
  invoicesService.list(db, user, query),
);
