"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { workOrdersService } from "./work-orders.service";
import {
  changeStatusSchema,
  checklistItemSchema,
  createWorkOrderSchema,
  lineSchema,
  noteSchema,
  workOrderSchema,
  type ChangeStatusInput,
  type CreateWorkOrderInput,
  type LineInput,
  type NoteInput,
  type WorkOrderInput,
} from "./work-orders.schema";
import { runAction } from "@/lib/action";
import type { ActionResult } from "@/lib/action-result";
import { idParam } from "@/lib/validation";

const OPS = ["ADMIN", "DISPATCHER"] as const;
const ADMIN = ["ADMIN"] as const;
const wo = z.object({ id: idParam });

function done<T>(res: ActionResult<T>) {
  if (res.ok) {
    revalidatePath("/work-orders", "layout");
    revalidatePath("/requests");
    revalidatePath("/customers", "layout");
    revalidatePath("/assets", "layout");
  }
  return res;
}

export async function createWorkOrderAction(input: CreateWorkOrderInput) {
  return done(
    await runAction({ roles: OPS, input: createWorkOrderSchema }, input, async ({ db, user, input }) => {
      const w = await workOrdersService.create(db, user, input);
      return { id: w.id, number: w.number };
    }),
  );
}

export async function updateWorkOrderAction(id: string, input: WorkOrderInput) {
  return done(
    await runAction(
      { roles: OPS, input: wo.extend({ data: workOrderSchema }) },
      { id, data: input },
      async ({ db, user, input }) => {
        await workOrdersService.update(db, user, input.id, input.data);
      },
    ),
  );
}

export async function changeWorkOrderStatusAction(id: string, input: ChangeStatusInput) {
  // Reopening is checked inside the state machine (Admin only), so both ops roles may call this.
  return done(
    await runAction(
      { roles: OPS, input: wo.extend({ data: changeStatusSchema }) },
      { id, data: input },
      async ({ db, user, input }) => {
        const w = await workOrdersService.changeStatus(db, user, input.id, input.data);
        return { status: w.status };
      },
    ),
  );
}

export async function deleteWorkOrderAction(id: string) {
  return done(
    await runAction({ roles: ADMIN, input: wo }, { id }, ({ db, input }) => workOrdersService.remove(db, input.id)),
  );
}

/** Add when `lineId` is null, otherwise update. */
export async function saveLineAction(id: string, lineId: string | null, input: LineInput) {
  return done(
    await runAction(
      { roles: OPS, input: wo.extend({ lineId: idParam.nullable(), data: lineSchema }) },
      { id, lineId, data: input },
      ({ db, user, input }) =>
        input.lineId
          ? workOrdersService.updateLine(db, input.id, input.lineId, input.data)
          : workOrdersService.addLine(db, user, input.id, input.data),
    ),
  );
}

export async function deleteLineAction(id: string, lineId: string) {
  return done(
    await runAction({ roles: OPS, input: wo.extend({ lineId: idParam }) }, { id, lineId }, ({ db, input }) =>
      workOrdersService.removeLine(db, input.id, input.lineId),
    ),
  );
}

export async function addNoteAction(id: string, input: NoteInput) {
  return done(
    await runAction(
      { roles: OPS, input: wo.extend({ data: noteSchema }) },
      { id, data: input },
      ({ db, user, input }) => workOrdersService.addNote(db, user, input.id, input.data),
    ),
  );
}

export async function deleteNoteAction(id: string, noteId: string) {
  return done(
    await runAction({ roles: OPS, input: wo.extend({ noteId: idParam }) }, { id, noteId }, ({ db, user, input }) =>
      workOrdersService.removeNote(db, user, input.id, input.noteId),
    ),
  );
}

export async function applyChecklistTemplateAction(id: string, templateId: string) {
  return done(
    await runAction(
      { roles: OPS, input: wo.extend({ templateId: idParam }) },
      { id, templateId },
      ({ db, user, input }) => workOrdersService.applyTemplate(db, user, input.id, input.templateId),
    ),
  );
}

export async function addChecklistItemAction(id: string, text: string) {
  return done(
    await runAction({ roles: OPS, input: wo.merge(checklistItemSchema) }, { id, text }, ({ db, user, input }) =>
      workOrdersService.addChecklistItem(db, user, input.id, input.text),
    ),
  );
}

export async function setChecklistItemAction(id: string, itemId: string, isDone: boolean) {
  return done(
    await runAction(
      { roles: OPS, input: wo.extend({ itemId: idParam, isDone: z.boolean() }) },
      { id, itemId, isDone },
      ({ db, user, input }) => workOrdersService.setChecklistItem(db, user, input.id, input.itemId, input.isDone),
    ),
  );
}

export async function deleteChecklistItemAction(id: string, itemId: string) {
  return done(
    await runAction({ roles: OPS, input: wo.extend({ itemId: idParam }) }, { id, itemId }, ({ db, input }) =>
      workOrdersService.removeChecklistItem(db, input.id, input.itemId),
    ),
  );
}

export async function deleteAttachmentAction(id: string, attachmentId: string) {
  return done(
    await runAction(
      { roles: OPS, input: wo.extend({ attachmentId: idParam }) },
      { id, attachmentId },
      ({ db, input }) => workOrdersService.removeAttachment(db, input.id, input.attachmentId),
    ),
  );
}
