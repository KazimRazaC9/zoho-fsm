"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { catalogService } from "./catalog.service";
import { serviceItemSchema, setItemActiveSchema, stockAdjustSchema, type ServiceItemInput } from "./catalog.schema";
import { runAction } from "@/lib/action";
import type { ActionResult } from "@/lib/action-result";
import { idParam } from "@/lib/validation";

const ADMIN = ["ADMIN"] as const;

function done<T>(res: ActionResult<T>) {
  if (res.ok) revalidatePath("/catalog");
  return res;
}

/** Create when `id` is null, otherwise update. */
export async function saveItemAction(id: string | null, input: ServiceItemInput) {
  return done(
    await runAction(
      { roles: ADMIN, input: z.object({ id: idParam.nullable(), data: serviceItemSchema }) },
      { id, data: input },
      ({ db, user, input }) =>
        input.id ? catalogService.update(db, input.id, input.data) : catalogService.create(db, user, input.data),
    ),
  );
}

export async function setItemActiveAction(id: string, isActive: boolean) {
  return done(
    await runAction(
      { roles: ADMIN, input: setItemActiveSchema.extend({ id: idParam }) },
      { id, isActive },
      ({ db, input }) => catalogService.setActive(db, input.id, input.isActive),
    ),
  );
}

export async function adjustStockAction(id: string, delta: number) {
  return done(
    await runAction(
      { roles: ADMIN, input: stockAdjustSchema.extend({ id: idParam }) },
      { id, delta },
      ({ db, input }) => catalogService.adjustStock(db, input.id, input.delta),
    ),
  );
}

export async function deleteItemAction(id: string) {
  return done(
    await runAction({ roles: ADMIN, input: z.object({ id: idParam }) }, { id }, ({ db, input }) =>
      catalogService.remove(db, input.id),
    ),
  );
}
