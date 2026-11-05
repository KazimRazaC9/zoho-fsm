import { ok, route } from "@/lib/api";
import { addressSchema, customersService } from "@/modules/customers";

/** POST /api/v1/customers/{id}/addresses — add a service address. */
export const POST = route({ roles: ["ADMIN", "DISPATCHER"], body: addressSchema }, async ({ db, user, params, body }) =>
  ok(await customersService.addAddress(db, user, params.id, body), "Address added.", 201),
);
