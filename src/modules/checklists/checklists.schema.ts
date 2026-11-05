import { z } from "zod";
import { requiredText } from "@/lib/validation";

export const checklistTemplateSchema = z.object({
  name: requiredText(200, "Name"),
  items: z
    .array(z.string().trim().min(1).max(300, "An item can be at most 300 characters."))
    .min(1, "Add at least one item.")
    .max(100, "Up to 100 items."),
  isActive: z.boolean(),
});
export type ChecklistTemplateInput = z.infer<typeof checklistTemplateSchema>;

export type ChecklistTemplateDto = {
  id: string;
  name: string;
  isActive: boolean;
  items: string[];
  updatedAt: string;
};

/** For pickers: active templates only. */
export type ChecklistTemplateOption = { id: string; name: string; itemCount: number };
