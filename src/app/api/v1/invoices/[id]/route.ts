import { route } from "@/lib/api";
import { invoiceSchema, invoicesService } from "@/modules/invoices";

/** GET /api/v1/invoices/{id} — lines, payments, balance. */
export const GET = route({ roles: ["ADMIN", "DISPATCHER"] }, ({ db, user, params }) =>
  invoicesService.get(db, user, params.id),
);

/** PUT /api/v1/invoices/{id} { dueDate, notes, discount } — Admin; the discount is locked once issued. */
export const PUT = route({ roles: ["ADMIN"], body: invoiceSchema }, ({ db, user, params, body }) =>
  invoicesService.update(db, user, params.id, body),
);
