import { ok, route } from "@/lib/api";
import { invoicesService } from "@/modules/invoices";
import { lineSchema } from "@/modules/work-orders";

const ADMIN = ["ADMIN"] as const;

/** PUT /api/v1/invoices/{id}/lines/{lineId} — drafts only. */
export const PUT = route({ roles: ADMIN, body: lineSchema }, async ({ db, user, params, body }) => {
  await invoicesService.updateLine(db, params.id, params.lineId, body);
  return ok(await invoicesService.get(db, user, params.id), "Line saved.");
});

/** DELETE /api/v1/invoices/{id}/lines/{lineId} — drafts only. */
export const DELETE = route({ roles: ADMIN }, async ({ db, user, params }) => {
  await invoicesService.removeLine(db, params.id, params.lineId);
  return ok(await invoicesService.get(db, user, params.id), "Line removed.");
});
