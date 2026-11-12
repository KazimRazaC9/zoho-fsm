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
import { issueSchema, type IssueInput } from "@/modules/work-orders/work-orders.schema";
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
      { roles: FIELD, permission: "field:edit", input: job.extend({ data: transitionSchema }) },
      { id, data: input },
      ({ db, user, input }) => fieldService.transition(db, user, input.id, input.data),
    ),
  );
}

export async function setJobChecklistAction(id: string, itemId: string, isDone: boolean) {
  return done(
    await runAction(
      { roles: FIELD, permission: "field:edit", input: job.extend({ itemId: idParam, isDone: z.boolean() }) },
      { id, itemId, isDone },
      async ({ db, user, input }) => {
        await fieldService.setChecklist(db, user, input.id, input.itemId, input.isDone);
      },
    ),
  );
}

export async function addJobNoteAction(id: string, text: string) {
  return done(
    await runAction(
      { roles: FIELD, permission: "field:create", input: job.merge(noteInputSchema) },
      { id, text },
      async ({ db, user, input }) => {
        await fieldService.addNote(db, user, input.id, input.text);
      },
    ),
  );
}

export async function addJobPartAction(id: string, data: AddPartInput) {
  return done(
    await runAction(
      { roles: FIELD, permission: "field:create", input: job.extend({ data: addPartSchema }) },
      { id, data },
      async ({ db, user, input }) => {
        await fieldService.addPart(db, user, input.id, input.data);
      },
    ),
  );
}

/** Called by the app every minute while a job is active and location sharing is on. */
export async function recordLocationAction(input: LocationInput) {
  return runAction(
    { roles: FIELD, permission: "field:edit", input: locationSchema },
    input,
    async ({ db, user, input }) => {
      await fieldService.recordLocation(db, user, input);
    },
  );
}

// ---------------------------------------------------------------- extra issues and proof

export async function addJobIssueAction(id: string, input: IssueInput) {
  return done(
    await runAction(
      { roles: FIELD, permission: "field:create", input: job.extend({ data: issueSchema }) },
      { id, data: input },
      ({ db, user, input }) => fieldService.addIssue(db, user, input.id, input.data),
    ),
  );
}

export async function updateJobIssueAction(id: string, issueId: string, input: IssueInput) {
  return done(
    await runAction(
      { roles: FIELD, permission: "field:edit", input: job.extend({ issueId: idParam, data: issueSchema }) },
      { id, issueId, data: input },
      async ({ db, user, input }) => {
        await fieldService.updateIssue(db, user, input.id, input.issueId, input.data);
      },
    ),
  );
}

export async function deleteJobIssueAction(id: string, issueId: string) {
  return done(
    await runAction(
      { roles: FIELD, permission: "field:delete", input: job.extend({ issueId: idParam }) },
      { id, issueId },
      async ({ db, user, input }) => {
        await fieldService.removeIssue(db, user, input.id, input.issueId);
      },
    ),
  );
}

export async function deleteJobFileAction(id: string, attachmentId: string) {
  return done(
    await runAction(
      { roles: FIELD, permission: "field:delete", input: job.extend({ attachmentId: idParam }) },
      { id, attachmentId },
      async ({ db, user, input }) => {
        await fieldService.removeFile(db, user, input.id, input.attachmentId);
      },
    ),
  );
}
