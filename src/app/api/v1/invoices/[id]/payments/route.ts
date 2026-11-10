import { ok, route } from "@/lib/api";
import { invoicesService, paymentSchema } from "@/modules/invoices";

/** POST /api/v1/invoices/{id}/payments { amount, method, reference?, paidAt? } — partial payments allowed; 400 if it exceeds the balance. Admin. */
export const POST = route({ roles: ["ADMIN"], body: paymentSchema }, async ({ db, user, params, body }) =>
  ok(await invoicesService.addPayment(db, user, params.id, body), "Payment recorded.", 201),
);
