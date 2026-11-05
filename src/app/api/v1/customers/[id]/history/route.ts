import { route } from "@/lib/api";
import { customersService } from "@/modules/customers";

/** GET /api/v1/customers/{id}/history — the customer's work orders, newest first. */
export const GET = route({ roles: ["ADMIN", "DISPATCHER"] }, ({ db, params }) =>
  customersService.history(db, params.id),
);
