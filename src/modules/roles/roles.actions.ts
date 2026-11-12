"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { idParam } from "@/lib/validation";
import { customRoleSchema, deleteCustomRoleSchema, updateCustomRoleSchema, type CustomRoleInput } from "./roles.schema";
import { rolesService } from "./roles.service";

const ADMIN = ["ADMIN"] as const;

export async function createCustomRoleAction(input: CustomRoleInput) {
  const result = await runAction(
    { roles: ADMIN, builtinOnly: true, input: customRoleSchema },
    input,
    ({ db, user, input }) => rolesService.create(db, user, input),
  );
  if (result.ok) {
    revalidatePath("/roles");
    revalidatePath("/users");
  }
  return result;
}

export async function updateCustomRoleAction(id: string, input: CustomRoleInput) {
  const result = await runAction(
    { roles: ADMIN, builtinOnly: true, input: updateCustomRoleSchema },
    { id, ...input },
    ({ db, input }) => {
      const { id: roleId, ...data } = input;
      return rolesService.update(db, roleId, data);
    },
  );
  if (result.ok) {
    revalidatePath("/roles");
    revalidatePath("/users");
  }
  return result;
}

export async function deleteCustomRoleAction(id: string) {
  const result = await runAction(
    { roles: ADMIN, builtinOnly: true, input: deleteCustomRoleSchema.extend({ id: idParam }) },
    { id },
    ({ db, input }) => rolesService.remove(db, input.id),
  );
  if (result.ok) {
    revalidatePath("/roles");
    revalidatePath("/users");
  }
  return result;
}
