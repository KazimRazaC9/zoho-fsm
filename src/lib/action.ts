import "server-only";
import { Prisma } from "@prisma/client";
import { ZodError, type z } from "zod";
import type { ActionResult } from "./action-result";
import { dbFor, requireBuiltinRole, requirePermission, requireRole, requireUser, type CurrentUser } from "./auth";
import type { AppDb } from "./db";
import { AppError, type FieldErrors } from "./errors";
import { logger } from "./logger";
import type { AppRole } from "./roles";
import type { PermissionRule } from "./permissions";

/**
 * Runs a server action with the same rules as an API route: signed-in user, role check, zod
 * validation, tenant-scoped db, and errors returned (not thrown) so the form can show them.
 *
 *   export async function createUserAction(input: unknown) {
 *     return runAction({ roles: ["ADMIN"], input: createUserSchema }, input, ({ db, user, input }) => …);
 *   }
 */
export async function runAction<TInput, TOut>(
  opts: {
    roles?: readonly AppRole[];
    permission?: PermissionRule;
    builtinOnly?: boolean;
    input: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  },
  raw: unknown,
  handler: (ctx: { input: TInput; user: CurrentUser; db: AppDb }) => Promise<TOut>,
): Promise<ActionResult<TOut>> {
  try {
    const user = await requireUser();
    if (opts.builtinOnly && opts.roles) requireBuiltinRole(user, opts.roles);
    else if (opts.roles) requireRole(user, opts.roles);
    requirePermission(user, opts.permission ?? null);
    const input = opts.input.parse(raw);
    const data = await handler({ input, user, db: dbFor(user) });
    return { ok: true, data };
  } catch (err) {
    return toActionError(err);
  }
}

export function toActionError(err: unknown): { ok: false; error: string; fieldErrors?: FieldErrors } {
  if (err instanceof ZodError) {
    const fieldErrors: FieldErrors = {};
    for (const i of err.issues) (fieldErrors[i.path.join(".") || "_"] ??= []).push(i.message);
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  if (err instanceof AppError) return { ok: false, error: err.message, fieldErrors: err.errors };
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return { ok: false, error: "A record with these values already exists." };
  }
  // Next.js uses thrown errors for redirect()/notFound(): let those through.
  if (
    err &&
    typeof err === "object" &&
    "digest" in err &&
    String((err as { digest: unknown }).digest).startsWith("NEXT_")
  ) {
    throw err;
  }
  logger.error({ err }, "action_failed");
  return { ok: false, error: "Something went wrong. Please try again." };
}
