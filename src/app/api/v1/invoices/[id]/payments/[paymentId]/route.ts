import { ok, route } from "@/lib/api";
import { invoicesService } from "@/modules/invoices";

/** DELETE /api/v1/invoices/{id}/payments/{paymentId} — removes a wrong payment and re-settles the invoice. Admin. */
export const DELETE = route({ roles: ["ADMIN"] }, async ({ db, user, params }) =>
  ok(await invoicesService.removePayment(db, user, params.id, params.paymentId), "Payment removed."),
);
