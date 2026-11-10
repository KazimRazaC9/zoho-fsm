"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fieldService } from "./field.service";
import {
  addPartSchema,
  locationSchema,
  noteInputSchema,
  transitionSchema,
  type AddPartInput,
  type LocationInput,
  type TransitionInput,
} from "./field.schema";
import { runAction } from "@/lib/action";
import type { ActionResult } from "@/lib/action-result";
import { idParam } from "@/lib/validation";

const FIELD = ["TECHNICIAN"] as const;
const job = z.object({ id: idParam });

function done<T>(res: ActionResult<T>) {
  if (res.ok) {
    revalidatePath("/my-jobs", "layout");
    revalidatePath("/dispatch");
    revalidatePath("/work-orders", "layout");
  }
  return res;
}

export async function transitionJobAction(id: string, input: TransitionInput) {
  return done(
    await runAction(
      { roles: FIELD, input: job.extend({ data: transitionSchema }) },
      { id, data: input },
      ({ db, user, input }) => fieldService.transition(db, user, input.id, input.data),
    ),
  );
}

export async function setJobChecklistAction(id: string, itemId: string, isDone: boolean) {
  return done(
    await runAction(
      { roles: FIELD, input: job.extend({ itemId: idParam, isDone: z.boolean() }) },
      { id, itemId, isDone },
      async ({ db, user, input }) => {
        await fieldService.setChecklist(db, user, input.id, input.itemId, input.isDone);
      },
    ),
  );
}

export async function addJobNoteAction(id: string, text: string) {
  return done(
    await runAction({ roles: FIELD, input: job.merge(noteInputSchema) }, { id, text }, async ({ db, user, input }) => {
      await fieldService.addNote(db, user, input.id, input.text);
    }),
  );
}

export async function addJobPartAction(id: string, data: AddPartInput) {
  return done(
    await runAction(
      { roles: FIELD, input: job.extend({ data: addPartSchema }) },
      { id, data },
      async ({ db, user, input }) => {
        await fieldService.addPart(db, user, input.id, input.data);
      },
    ),
  );
}

/** Called by the app every minute while a job is active and location sharing is on. */
export async function recordLocationAction(input: LocationInput) {
  return runAction({ roles: FIELD, input: locationSchema }, input, async ({ db, user, input }) => {
    await fieldService.recordLocation(db, user, input);
  });
}
