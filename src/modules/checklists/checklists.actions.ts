"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checklistsService } from "./checklists.service";
import { checklistTemplateSchema, type ChecklistTemplateInput } from "./checklists.schema";
import { runAction } from "@/lib/action";
import type { ActionResult } from "@/lib/action-result";
import { idParam } from "@/lib/validation";

const ADMIN = ["ADMIN"] as const;

function done<T>(res: ActionResult<T>) {
  if (res.ok) revalidatePath("/checklists");
  return res;
}

/** Create when `id` is null, otherwise update. */
export async function saveChecklistTemplateAction(id: string | null, input: ChecklistTemplateInput) {
  return done(
    await runAction(
      {
        roles: ADMIN,
        permission: id ? "checklists:edit" : "checklists:create",
        input: z.object({ id: idParam.nullable(), data: checklistTemplateSchema }),
      },
      { id, data: input },
      ({ db, user, input }) =>
        input.id
          ? checklistsService.update(db, user, input.id, input.data)
          : checklistsService.create(db, user, input.data),
    ),
  );
}

export async function deleteChecklistTemplateAction(id: string) {
  return done(
    await runAction(
      { roles: ADMIN, permission: "checklists:delete", input: z.object({ id: idParam }) },
      { id },
      ({ db, input }) => checklistsService.remove(db, input.id),
    ),
  );
}
