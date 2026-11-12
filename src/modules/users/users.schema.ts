import { z } from "zod";
import { emailSchema, passwordPolicy } from "@/modules/auth/auth.schema";
import { hexColor, hhmm, optionalText, requiredText } from "@/lib/validation";

/** Roles an Admin may give to company staff. */
export const STAFF_ROLES = ["ADMIN", "DISPATCHER", "TECHNICIAN"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const WEEK_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

export const technicianProfileSchema = z
  .object({
    // Blank entries are dropped by the service (lets a comma-separated input be typed freely).
    skills: z.array(z.string().trim().max(50, "A skill can be at most 50 characters.")).max(20, "Up to 20 skills."),
    hourlyRate: z.number({ invalid_type_error: "Enter a number." }).min(0, "Must be 0 or more.").max(1_000_000),
    workStart: hhmm,
    workEnd: hhmm,
    workingDays: z.array(z.enum(WEEK_DAYS)).min(1, "Pick at least one working day."),
    color: hexColor,
  })
  .refine((v) => v.workEnd > v.workStart, { path: ["workEnd"], message: "End time must be after start time." });
export type TechnicianProfileInput = z.infer<typeof technicianProfileSchema>;

export const DEFAULT_TECHNICIAN_PROFILE: TechnicianProfileInput = {
  skills: [],
  hourlyRate: 0,
  workStart: "09:00",
  workEnd: "18:00",
  workingDays: ["MON", "TUE", "WED", "THU", "FRI"],
  color: "#3b82f6",
};

const userFields = {
  fullName: requiredText(200, "Full name"),
  email: emailSchema,
  phone: optionalText(50),
  role: z.enum(STAFF_ROLES),
  customRoleId: z.string().min(1).nullable().optional(),
};

export const createUserSchema = z.object({
  ...userFields,
  password: passwordPolicy,
  technicianProfile: technicianProfileSchema.optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object(userFields);
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({ password: passwordPolicy });
export const setUserActiveSchema = z.object({ isActive: z.boolean() });

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().max(200).optional(),
  role: z.enum(STAFF_ROLES).optional().catch(undefined),
  status: z.enum(["active", "inactive", "all"]).default("all").catch("all"),
  sortBy: z.enum(["fullName", "email", "role", "createdAt", "lastLoginAt"]).default("fullName").catch("fullName"),
  sortDir: z.enum(["asc", "desc"]).default("asc").catch("asc"),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export type TechnicianProfileDto = TechnicianProfileInput & { hourlyRate: number };

export type UserDto = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  customRoleId: string | null;
  customRoleName: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  technicianProfile: TechnicianProfileDto | null;
};
