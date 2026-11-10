"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { schedulingService } from "./scheduling.service";
import { scheduleSchema, type ScheduleInput } from "./scheduling.schema";
import { runAction } from "@/lib/action";
import type { ActionResult } from "@/lib/action-result";
import { idParam } from "@/lib/validation";

const OPS = ["ADMIN", "DISPATCHER"] as const;

function done<T>(res: ActionResult<T>) {
  if (res.ok) {
    revalidatePath("/dispatch");
    revalidatePath("/work-orders", "layout");
  }
  return res;
}

/** Assign a technician and time slot (or move the existing visit). */
export async function scheduleWorkOrderAction(workOrderId: string, input: ScheduleInput) {
  return done(
    await runAction(
      { roles: OPS, input: z.object({ id: idParam, data: scheduleSchema }) },
      { id: workOrderId, data: input },
      ({ db, user, input }) => schedulingService.schedule(db, user, input.id, input.data),
    ),
  );
}

/** Take a work order off the board. */
export async function unscheduleWorkOrderAction(workOrderId: string) {
  return done(
    await runAction(
      { roles: OPS, input: z.object({ id: idParam }) },
      { id: workOrderId },
      async ({ db, user, input }) => {
        await schedulingService.unschedule(db, user, input.id);
      },
    ),
  );
}
