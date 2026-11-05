import { ok, route } from "@/lib/api";
import { customersService, updateCustomerSchema } from "@/modules/customers";

const OPS = ["ADMIN", "DISPATCHER"] as const;

/** GET /api/v1/customers/{id} — with its service addresses. */
export const GET = route({ roles: OPS }, ({ db, params }) => customersService.get(db, params.id));

/** PUT /api/v1/customers/{id} — type, name, email, phone, notes. */
export const PUT = route({ roles: OPS, body: updateCustomerSchema }, ({ db, params, body }) =>
  customersService.update(db, params.id, body),
);

/** DELETE /api/v1/customers/{id} — Admin; soft-deletes its addresses and assets too. 409 while work orders are open. */
export const DELETE = route({ roles: ["ADMIN"] }, async ({ db, params }) => {
  await customersService.remove(db, params.id);
  return ok(null, "Customer deleted.");
});
