import { ok, route } from "@/lib/api";
import { invoicesService } from "@/modules/invoices";

/** POST /api/v1/work-orders/{id}/invoice — draft invoice from a completed work order (lines copied). Admin. */
export const POST = route({ roles: ["ADMIN"] }, async ({ db, user, params }) =>
  ok(await invoicesService.createFromWorkOrder(db, user, params.id), "Invoice created.", 201),
);
