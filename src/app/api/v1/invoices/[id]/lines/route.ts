import { ok, route } from "@/lib/api";
import { invoicesService } from "@/modules/invoices";
import { lineSchema } from "@/modules/work-orders";

/** POST /api/v1/invoices/{id}/lines — drafts only. Admin. */
export const POST = route({ roles: ["ADMIN"], body: lineSchema }, async ({ db, user, params, body }) => {
  await invoicesService.addLine(db, user, params.id, body);
  return ok(await invoicesService.get(db, user, params.id), "Line added.", 201);
});
