import { z } from "zod";
import { route } from "@/lib/api";
import { workOrdersService } from "@/modules/work-orders";

const OPS = ["ADMIN", "DISPATCHER"] as const;

/** PATCH /api/v1/work-orders/{id}/checklist/{itemId} { isDone } */
export const PATCH = route(
  { roles: OPS, body: z.object({ isDone: z.boolean() }) },
  async ({ db, user, params, body }) => {
    await workOrdersService.setChecklistItem(db, user, params.id, params.itemId, body.isDone);
    return workOrdersService.get(db, user, params.id);
  },
);

/** DELETE /api/v1/work-orders/{id}/checklist/{itemId} */
export const DELETE = route({ roles: OPS }, async ({ db, user, params }) => {
  await workOrdersService.removeChecklistItem(db, params.id, params.itemId);
  return workOrdersService.get(db, user, params.id);
});
