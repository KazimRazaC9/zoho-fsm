"use server";

import { revalidatePath } from "next/cache";
import { companiesService } from "./companies.service";
import {
  companySettingsSchema,
  createCompanySchema,
  setCompanyActiveSchema,
  type CompanySettingsInput,
  type CreateCompanyInput,
} from "./companies.schema";
import { runAction } from "@/lib/action";
import { idParam } from "@/lib/validation";
import { z } from "zod";

export async function updateCompanySettingsAction(input: CompanySettingsInput) {
  const res = await runAction({ roles: ["ADMIN"], input: companySettingsSchema }, input, ({ db, user, input }) =>
    companiesService.updateSettings(db, user, input),
  );
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function createCompanyAction(input: CreateCompanyInput) {
  const res = await runAction({ roles: ["SUPER_ADMIN"], input: createCompanySchema }, input, ({ db, user, input }) =>
    companiesService.create(db, user, input),
  );
  if (res.ok) revalidatePath("/companies");
  return res;
}

export async function setCompanyActiveAction(id: string, isActive: boolean) {
  const res = await runAction(
    { roles: ["SUPER_ADMIN"], input: setCompanyActiveSchema.extend({ id: idParam }) },
    { id, isActive },
    ({ db, user, input }) => companiesService.setActive(db, user, input.id, input.isActive),
  );
  if (res.ok) revalidatePath("/companies");
  return res;
}

export async function updateCompanyAction(id: string, input: CompanySettingsInput) {
  const res = await runAction(
    { roles: ["SUPER_ADMIN"], input: z.object({ id: idParam, data: companySettingsSchema }) },
    { id, data: input },
    ({ db, user, input }) => companiesService.update(db, user, input.id, input.data),
  );
  if (res.ok) revalidatePath("/companies");
  return res;
}
