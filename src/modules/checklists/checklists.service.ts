import "server-only";
import type { Prisma } from "@prisma/client";
import type { ChecklistTemplateDto, ChecklistTemplateInput, ChecklistTemplateOption } from "./checklists.schema";
import type { CurrentUser } from "@/lib/auth";
import type { AppDb } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

const select = {
  id: true,
  name: true,
  isActive: true,
  updatedAt: true,
  items: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" }, select: { text: true } },
} satisfies Prisma.ChecklistTemplateSelect;
type Row = Prisma.ChecklistTemplateGetPayload<{ select: typeof select }>;

const toDto = (t: Row): ChecklistTemplateDto => ({
  id: t.id,
  name: t.name,
  isActive: t.isActive,
  items: t.items.map((i) => i.text),
  updatedAt: t.updatedAt.toISOString(),
});

const companyOf = (actor: CurrentUser) => {
  if (!actor.companyId) throw new ForbiddenError("This action needs a company account.");
  return actor.companyId;
};

async function getOrThrow(db: AppDb, id: string) {
  const t = await db.checklistTemplate.findFirst({ where: { id }, select });
  if (!t) throw new NotFoundError("Checklist template", id);
  return t;
}

/** Item texts of a template, in order — copied onto a work order when applied. */
export async function templateItems(db: AppDb, id: string): Promise<string[]> {
  return (await getOrThrow(db, id)).items.map((i) => i.text);
}

export const checklistsService = {
  async list(db: AppDb): Promise<ChecklistTemplateDto[]> {
    const rows = await db.checklistTemplate.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], select });
    return rows.map(toDto);
  },

  async options(db: AppDb): Promise<ChecklistTemplateOption[]> {
    const rows = await db.checklistTemplate.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select });
    return rows.map((t) => ({ id: t.id, name: t.name, itemCount: t.items.length }));
  },

  async get(db: AppDb, id: string): Promise<ChecklistTemplateDto> {
    return toDto(await getOrThrow(db, id));
  },

  templateItems,

  async create(db: AppDb, actor: CurrentUser, input: ChecklistTemplateInput): Promise<ChecklistTemplateDto> {
    const companyId = companyOf(actor);
    return db.$withTx(async () => {
      const t = await db.checklistTemplate.create({
        data: { companyId, name: input.name, isActive: input.isActive },
        select: { id: true },
      });
      await db.checklistTemplateItem.createMany({
        data: input.items.map((text, i) => ({ companyId, templateId: t.id, text, sortOrder: i + 1 })),
      });
      return toDto(await getOrThrow(db, t.id));
    });
  },

  /** Replaces the item list. Work orders keep the copy they were given. */
  async update(
    db: AppDb,
    actor: CurrentUser,
    id: string,
    input: ChecklistTemplateInput,
  ): Promise<ChecklistTemplateDto> {
    const companyId = companyOf(actor);
    await getOrThrow(db, id);
    return db.$withTx(async () => {
      await db.checklistTemplate.update({ where: { id }, data: { name: input.name, isActive: input.isActive } });
      await db.checklistTemplateItem.deleteMany({ where: { templateId: id } });
      await db.checklistTemplateItem.createMany({
        data: input.items.map((text, i) => ({ companyId, templateId: id, text, sortOrder: i + 1 })),
      });
      return toDto(await getOrThrow(db, id));
    });
  },

  async remove(db: AppDb, id: string): Promise<void> {
    await getOrThrow(db, id);
    await db.$withTx(async () => {
      await db.checklistTemplateItem.deleteMany({ where: { templateId: id } });
      await db.checklistTemplate.delete({ where: { id } });
    });
  },
};
