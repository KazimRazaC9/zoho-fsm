"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { authService } from "./auth.service";
import { changePasswordSchema, loginSchema } from "./auth.schema";

export type ChangePasswordState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"currentPassword" | "newPassword", string[]>>;
};

/** Account page: change own password (also revokes all mobile refresh tokens). */
export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await authService.changePassword(user.id, parsed.data);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message, fieldErrors: err.errors };
    throw err;
  }
}

export type LoginState = { error?: string; fieldErrors?: Partial<Record<"email" | "password", string[]>> };

/** Login form submit (web). On success Auth.js redirects to "/", which forwards to the role's home. */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const callbackUrl = String(formData.get("callbackUrl") ?? "");
  const redirectTo = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";

  try {
    await signIn("credentials", { ...parsed.data, redirectTo });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      const code = (err as AuthError & { code?: string }).code;
      if (code === "rate_limited") return { error: "Too many attempts. Wait a minute and try again." };
      return { error: "Invalid email or password." };
    }
    throw err; // NEXT_REDIRECT on success
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
