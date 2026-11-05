"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { customersService } from "./customers.service";
import {
  addressSchema,
  createCustomerSchema,
  updateCustomerSchema,
  type AddressInput,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from "./customers.schema";
import { runAction } from "@/lib/action";
import type { ActionResult } from "@/lib/action-result";
import { idParam } from "@/lib/validation";

const OPS = ["ADMIN", "DISPATCHER"] as const;
const ADMIN = ["ADMIN"] as const;

function done<T>(res: ActionResult<T>) {
  if (res.ok) {
    revalidatePath("/customers", "layout");
    revalidatePath("/assets", "layout");
  }
  return res;
}

export async function createCustomerAction(input: CreateCustomerInput) {
  return done(
    await runAction({ roles: OPS, input: createCustomerSchema }, input, ({ db, user, input }) =>
      customersService.create(db, user, input),
    ),
  );
}

export async function updateCustomerAction(id: string, input: UpdateCustomerInput) {
  return done(
    await runAction(
      { roles: OPS, input: z.object({ id: idParam, data: updateCustomerSchema }) },
      { id, data: input },
      ({ db, input }) => customersService.update(db, input.id, input.data),
    ),
  );
}

export async function deleteCustomerAction(id: string) {
  return done(
    await runAction({ roles: ADMIN, input: z.object({ id: idParam }) }, { id }, ({ db, input }) =>
      customersService.remove(db, input.id),
    ),
  );
}

export async function saveAddressAction(customerId: string, addressId: string | null, input: AddressInput) {
  return done(
    await runAction(
      { roles: OPS, input: z.object({ customerId: idParam, addressId: idParam.nullable(), data: addressSchema }) },
      { customerId, addressId, data: input },
      ({ db, user, input }) =>
        input.addressId
          ? customersService.updateAddress(db, input.customerId, input.addressId, input.data)
          : customersService.addAddress(db, user, input.customerId, input.data),
    ),
  );
}

export async function deleteAddressAction(customerId: string, addressId: string) {
  return done(
    await runAction(
      { roles: OPS, input: z.object({ customerId: idParam, addressId: idParam }) },
      { customerId, addressId },
      ({ db, input }) => customersService.removeAddress(db, input.customerId, input.addressId),
    ),
  );
}
