import { ok, route } from "@/lib/api";
import { addressSchema, customersService } from "@/modules/customers";

const OPS = ["ADMIN", "DISPATCHER"] as const;

/** PUT /api/v1/customers/{id}/addresses/{addressId} */
export const PUT = route({ roles: OPS, body: addressSchema }, ({ db, params, body }) =>
  customersService.updateAddress(db, params.id, params.addressId, body),
);

/** DELETE /api/v1/customers/{id}/addresses/{addressId} — 409 for the last address or one with open work orders. */
export const DELETE = route({ roles: OPS }, async ({ db, params }) => {
  await customersService.removeAddress(db, params.id, params.addressId);
  return ok(null, "Address deleted.");
});
