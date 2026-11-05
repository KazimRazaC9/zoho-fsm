"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assetsService } from "./assets.service";
import { assetSchema, type AssetInput } from "./assets.schema";
import { runAction } from "@/lib/action";
import type { ActionResult } from "@/lib/action-result";
import type { CurrentUser } from "@/lib/auth";
import type { AppDb } from "@/lib/db";
import { idParam } from "@/lib/validation";
import { companiesService } from "@/modules/companies";

const OPS = ["ADMIN", "DISPATCHER"] as const;
const ADMIN = ["ADMIN"] as const;

function done<T>(res: ActionResult<T>) {
  if (res.ok) {
    revalidatePath("/assets", "layout");
    revalidatePath("/customers", "layout");
  }
  return res;
}

const zoneOf = async (db: AppDb, user: CurrentUser) => (await companiesService.getSettings(db, user)).timeZone;

/** Create when `id` is null, otherwise update. */
export async function saveAssetAction(id: string | null, input: AssetInput) {
  return done(
    await runAction(
      { roles: OPS, input: z.object({ id: idParam.nullable(), data: assetSchema }) },
      { id, data: input },
      async ({ db, user, input }) => {
        const tz = await zoneOf(db, user);
        return input.id
          ? assetsService.update(db, input.id, input.data, tz)
          : assetsService.create(db, user, input.data, tz);
      },
    ),
  );
}

export async function deleteAssetAction(id: string) {
  return done(
    await runAction({ roles: ADMIN, input: z.object({ id: idParam }) }, { id }, ({ db, input }) =>
      assetsService.remove(db, input.id),
    ),
  );
}
