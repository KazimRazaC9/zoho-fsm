import { ok, route } from "@/lib/api";
import { createCustomerSchema, customerListQuerySchema, customersService } from "@/modules/customers";

const OPS = ["ADMIN", "DISPATCHER"] as const;

/** GET /api/v1/customers?page&pageSize&search&type&sortBy&sortDir — search covers name, email, phone and addresses. */
export const GET = route({ roles: OPS, query: customerListQuerySchema }, ({ db, query }) =>
  customersService.list(db, query),
);

/** POST /api/v1/customers — a customer with one or more service addresses. */
export const POST = route({ roles: OPS, body: createCustomerSchema }, async ({ db, user, body }) =>
  ok(await customersService.create(db, user, body), "Customer created.", 201),
);
