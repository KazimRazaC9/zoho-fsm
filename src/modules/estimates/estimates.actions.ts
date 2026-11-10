"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { estimatesService } from "./estimates.service";
import {
  convertEstimateSchema,
  estimateSchema,
  estimateStatusSchema,
  type ConvertEstimateInput,
  type EstimateInput,
  type EstimateStatusInput,
} from "./estimates.schema";
import { runAction } from "@/lib/action";
import type { ActionResult } from "@/lib/action-result";
import { idParam } from "@/lib/validation";
import { lineSchema, type LineInput } from "@/modules/work-orders/work-orders.schema";

const OPS = ["ADMIN", "DISPATCHER"] as const;
const est = z.object({ id: idParam });

function done<T>(res: ActionResult<T>) {
  if (res.ok) {
    revalidatePath("/estimates", "layout");
    revalidatePath("/requests");
    revalidatePath("/work-orders", "layout");
  }
  return res;
}

/** Create when `id` is null, otherwise update (drafts only). */
export async function saveEstimateAction(id: string | null, input: EstimateInput) {
  return done(
    await runAction(
      { roles: OPS, input: z.object({ id: idParam.nullable(), data: estimateSchema }) },
      { id, data: input },
      async ({ db, user, input }) => {
        const e = input.id
          ? await estimatesService.update(db, user, input.id, input.data)
          : await estimatesService.create(db, user, input.data);
        return { id: e.id, number: e.number };
      },
    ),
  );
}

export async function deleteEstimateAction(id: string) {
  return done(
    await runAction({ roles: OPS, input: est }, { id }, async ({ db, input }) => {
      await estimatesService.remove(db, input.id);
    }),
  );
}

export async function changeEstimateStatusAction(id: string, input: EstimateStatusInput) {
  return done(
    await runAction(
      { roles: OPS, input: est.extend({ data: estimateStatusSchema }) },
      { id, data: input },
      async ({ db, user, input }) => {
        await estimatesService.changeStatus(db, user, input.id, input.data.status);
      },
    ),
  );
}

export async function convertEstimateAction(id: string, input: ConvertEstimateInput) {
  return done(
    await runAction(
      { roles: OPS, input: est.extend({ data: convertEstimateSchema }) },
      { id, data: input },
      ({ db, user, input }) => estimatesService.convert(db, user, input.id, input.data),
    ),
  );
}

/** Create when `lineId` is null, otherwise update. */
export async function saveEstimateLineAction(id: string, lineId: string | null, input: LineInput) {
  return done(
    await runAction(
      { roles: OPS, input: est.extend({ lineId: idParam.nullable(), data: lineSchema }) },
      { id, lineId, data: input },
      async ({ db, user, input }) => {
        if (input.lineId) await estimatesService.updateLine(db, input.id, input.lineId, input.data);
        else await estimatesService.addLine(db, user, input.id, input.data);
      },
    ),
  );
}

export async function deleteEstimateLineAction(id: string, lineId: string) {
  return done(
    await runAction({ roles: OPS, input: est.extend({ lineId: idParam }) }, { id, lineId }, async ({ db, input }) => {
      await estimatesService.removeLine(db, input.id, input.lineId);
    }),
  );
}
