"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requestsService } from "./requests.service";
import { convertRequestSchema, requestSchema, type ConvertRequestInput, type RequestInput } from "./requests.schema";
import { runAction } from "@/lib/action";
import type { ActionResult } from "@/lib/action-result";
import { idParam } from "@/lib/validation";

const OPS = ["ADMIN", "DISPATCHER"] as const;

function done<T>(res: ActionResult<T>) {
  if (res.ok) {
    revalidatePath("/requests");
    revalidatePath("/work-orders", "layout");
  }
  return res;
}

/** Create when `id` is null, otherwise update. */
export async function saveRequestAction(id: string | null, input: RequestInput) {
  return done(
    await runAction(
      {
        roles: OPS,
        permission: id ? "requests:edit" : "requests:create",
        input: z.object({ id: idParam.nullable(), data: requestSchema }),
      },
      { id, data: input },
      async ({ db, user, input }) => {
        const r = input.id
          ? await requestsService.update(db, user, input.id, input.data)
          : await requestsService.create(db, user, input.data);
        return { id: r.id, number: r.number };
      },
    ),
  );
}

export async function cancelRequestAction(id: string) {
  return done(
    await runAction(
      { roles: OPS, permission: "requests:edit", input: z.object({ id: idParam }) },
      { id },
      async ({ db, user, input }) => {
        await requestsService.cancel(db, user, input.id);
      },
    ),
  );
}

export async function convertRequestAction(id: string, input: ConvertRequestInput) {
  return done(
    await runAction(
      { roles: OPS, permission: "workOrders:create", input: z.object({ id: idParam, data: convertRequestSchema }) },
      { id, data: input },
      ({ db, user, input }) => requestsService.convert(db, user, input.id, input.data),
    ),
  );
}
