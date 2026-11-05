import { ok, route } from "@/lib/api";
import { createWorkOrderSchema, workOrderListQuerySchema, workOrdersService } from "@/modules/work-orders";

const OPS = ["ADMIN", "DISPATCHER"] as const;

/** GET /api/v1/work-orders?status=open|overdue|NEW…&priority&customerId&search&sortBy=createdAt|dueDate|number&sortDir */
export const GET = route({ roles: OPS, query: workOrderListQuerySchema }, ({ db, query }) =>
  workOrdersService.list(db, query),
);

/** POST /api/v1/work-orders — numbered WO-000001…; optional checklistTemplateId. */
export const POST = route({ roles: OPS, body: createWorkOrderSchema }, async ({ db, user, body }) =>
  ok(await workOrdersService.create(db, user, body), "Work order created.", 201),
);
