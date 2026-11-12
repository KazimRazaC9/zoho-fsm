import { z } from "zod";
import { PERMISSIONS, type AppPermission } from "@/lib/permissions";
import { STAFF_ROLES } from "@/modules/users/users.schema";

const roleFields = {
  name: z.string().trim().min(2, "Role name must be at least 2 characters.").max(80),
  description: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((value) => value || null),
  baseRole: z.enum(STAFF_ROLES),
  permissions: z
    .array(
      z.custom<AppPermission>(
        (value) => typeof value === "string" && PERMISSIONS.includes(value as AppPermission),
        "Choose a valid permission.",
      ),
    )
    .min(1, "Choose at least one permission.")
    .max(PERMISSIONS.length),
};

const roleSchema = z.object(roleFields);

function uniquePermissions(value: z.infer<typeof roleSchema>, ctx: z.RefinementCtx) {
  if (new Set(value.permissions).size !== value.permissions.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["permissions"], message: "Remove duplicate permissions." });
  }
}

export const customRoleSchema = roleSchema.superRefine(uniquePermissions);

export type CustomRoleInput = z.infer<typeof customRoleSchema>;

export const updateCustomRoleSchema = roleSchema.extend({ id: z.string().min(1) }).superRefine(uniquePermissions);
export const deleteCustomRoleSchema = z.object({ id: z.string().min(1) });

export type CustomRoleDto = {
  id: string;
  name: string;
  description: string | null;
  baseRole: (typeof STAFF_ROLES)[number];
  permissions: string[];
  memberCount: number;
  createdAt: string;
};
