"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { usersService } from "./users.service";
import {
  createUserSchema,
  resetPasswordSchema,
  setUserActiveSchema,
  technicianProfileSchema,
  updateUserSchema,
  type CreateUserInput,
  type TechnicianProfileInput,
  type UpdateUserInput,
} from "./users.schema";
import { runAction } from "@/lib/action";
import type { ActionResult } from "@/lib/action-result";
import { idParam } from "@/lib/validation";

const ADMIN = ["ADMIN"] as const;

function done<T>(res: ActionResult<T>) {
  if (res.ok) revalidatePath("/users");
  return res;
}

export async function createUserAction(input: CreateUserInput) {
  return done(
    await runAction({ roles: ADMIN, input: createUserSchema }, input, ({ db, user, input }) =>
      usersService.create(db, user, input),
    ),
  );
}

export async function updateUserAction(id: string, input: UpdateUserInput) {
  return done(
    await runAction(
      { roles: ADMIN, input: z.object({ id: idParam, data: updateUserSchema }) },
      { id, data: input },
      ({ db, user, input }) => usersService.update(db, user, input.id, input.data),
    ),
  );
}

export async function updateTechnicianProfileAction(id: string, input: TechnicianProfileInput) {
  return done(
    await runAction(
      { roles: ADMIN, input: z.object({ id: idParam, data: technicianProfileSchema }) },
      { id, data: input },
      ({ db, user, input }) => usersService.updateTechnicianProfile(db, user, input.id, input.data),
    ),
  );
}

export async function setUserActiveAction(id: string, isActive: boolean) {
  return done(
    await runAction(
      { roles: ADMIN, input: setUserActiveSchema.extend({ id: idParam }) },
      { id, isActive },
      ({ db, user, input }) => usersService.setActive(db, user, input.id, input.isActive),
    ),
  );
}

export async function resetUserPasswordAction(id: string, password: string) {
  return done(
    await runAction(
      { roles: ADMIN, input: resetPasswordSchema.extend({ id: idParam }) },
      { id, password },
      ({ db, user, input }) => usersService.resetPassword(db, user, input.id, input.password),
    ),
  );
}

export async function deleteUserAction(id: string) {
  return done(
    await runAction({ roles: ADMIN, input: z.object({ id: idParam }) }, { id }, ({ db, user, input }) =>
      usersService.remove(db, user, input.id),
    ),
  );
}
