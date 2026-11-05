import { z } from "zod";
import type { AppRole } from "@/lib/roles";

/** Shared by the login form (client) and the API (server). */

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);

export const passwordPolicy = z
  .string()
  .min(8, "At least 8 characters.")
  .max(100)
  .regex(/[A-Z]/, "Include an uppercase letter.")
  .regex(/[a-z]/, "Include a lowercase letter.")
  .regex(/[0-9]/, "Include a number.")
  .regex(/[^A-Za-z0-9]/, "Include a symbol.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(500) });
export const logoutSchema = refreshSchema;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: passwordPolicy,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ["newPassword"],
    message: "The new password must be different.",
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** The signed-in user as every layer sees it. */
export type SessionUser = {
  id: string;
  fullName: string;
  email: string;
  role: AppRole;
  companyId: string | null;
  companyName: string | null;
  timeZone: string | null;
  currency: string | null;
};

export type TokenResponse = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: SessionUser;
};
