import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  AUDITED_MODELS,
  auditSnapshot,
  CrossTenantWriteError,
  rewriteOperation,
  scopeWhere,
  type DbContext,
} from "./db-scope";
import { ForbiddenError } from "./errors";

export type { DbContext } from "./db-scope";

/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma delegates are addressed by model name at runtime. */

// ---------------------------------------------------------------------------
// Base client (app role: row-level security applies). One per process.
// ---------------------------------------------------------------------------
const globalForPrisma = globalThis as unknown as { prismaBase?: PrismaClient };

export const prismaBase =
  globalForPrisma.prismaBase ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = prismaBase;

type Tx = Prisma.TransactionClient;

/** The interactive transaction a `$withTx` call is running in (per async call chain). */
const txStore = new AsyncLocalStorage<{ tx: Tx; ctx: DbContext }>();

const delegateOf = (tx: Tx, model: string) => (tx as any)[model.charAt(0).toLowerCase() + model.slice(1)];

/** SET LOCAL the RLS settings for the current transaction. */
async function applyRlsContext(tx: Tx, ctx: DbContext) {
  const companyId = ctx.kind === "tenant" ? ctx.companyId : "";
  const bypass = ctx.kind === "system" ? "on" : "off";
  await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true), set_config('app.bypass_rls', ${bypass}, true)`;
}

/** Run fn inside a transaction with RLS context set — reusing the surrounding $withTx if any. */
async function inContext<T>(ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const current = txStore.getStore();
  if (current) {
    if (!sameContext(current.ctx, ctx)) throw new ForbiddenError("Mixed tenant contexts in one transaction.");
    return fn(current.tx);
  }
  return prismaBase.$transaction(async (tx) => {
    await applyRlsContext(tx, ctx);
    return fn(tx);
  });
}

function sameContext(a: DbContext, b: DbContext) {
  if (a.kind !== b.kind) return false;
  return a.kind === "tenant" && b.kind === "tenant" ? a.companyId === b.companyId : true;
}

const WRITE_OPS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

/**
 * A Prisma client bound to one caller.
 * - tenant: every query is scoped to the company (Prisma filter + PostgreSQL RLS), creates are
 *   stamped with companyId/createdById, delete = soft delete, writes are audited.
 * - system: RLS bypass for login lookups, super-admin tools and background jobs. Use sparingly.
 *
 * Prisma's types still require `companyId` on create: pass `db.$dbContext()`'s companyId (the
 * extension verifies it matches and rejects anything else). Nested writes (e.g.
 * `lines: { create: [...] }`) are not rewritten either: pass `companyId` on nested rows yourself —
 * RLS rejects rows for another company.
 */
export function createDb(ctx: DbContext) {
  return prismaBase.$extends({
    name: "tenant-scope",
    client: {
      /** Run several operations atomically in this context (nested calls reuse the same transaction). */
      $withTx<T>(fn: () => Promise<T>): Promise<T> {
        if (txStore.getStore()) return fn();
        return prismaBase.$transaction(async (tx) => {
          await applyRlsContext(tx, ctx);
          return txStore.run({ tx, ctx }, fn);
        });
      },
      /** Raw SQL with RLS context set. Raw queries must still filter companyId + deletedAt themselves. */
      $rawInContext<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
        return inContext(ctx, fn);
      },
      $dbContext(): DbContext {
        return ctx;
      },
    },
    query: {
      $allModels: {
        async $allOperations({ model, operation, args }) {
          let rewritten;
          try {
            rewritten = rewriteOperation(model, operation, args, ctx);
          } catch (e) {
            if (e instanceof CrossTenantWriteError) throw new ForbiddenError(e.message);
            throw e;
          }

          return inContext(ctx, async (tx) => {
            const delegate = delegateOf(tx, model);
            const audited = AUDITED_MODELS.has(model) && WRITE_OPS.has(operation);

            let before: unknown = null;
            if (audited && (operation === "update" || operation === "delete" || operation === "upsert")) {
              before = await delegate.findFirst({ where: scopeWhere(model, ctx, (args as any)?.where) });
            }

            const result = await delegate[rewritten.operation](rewritten.args);

            if (audited) {
              const single = ![
                "createMany",
                "updateMany",
                "deleteMany",
                "createManyAndReturn",
                "updateManyAndReturn",
              ].includes(operation);
              const entityId = single ? String((result as any)?.id ?? (before as any)?.id ?? "") : "*";
              await tx.auditLog.create({
                data: {
                  companyId:
                    ctx.kind === "tenant"
                      ? ctx.companyId
                      : ((result as any)?.companyId ?? (model === "Company" ? (result as any)?.id : null)),
                  entityType: model,
                  entityId,
                  action: operation.startsWith("create")
                    ? "CREATE"
                    : operation.startsWith("delete")
                      ? "DELETE"
                      : "UPDATE",
                  before: (single
                    ? auditSnapshot(before)
                    : { where: auditSnapshot((args as any)?.where) }) as Prisma.InputJsonValue,
                  after: (single
                    ? auditSnapshot(result)
                    : { count: (result as any)?.count ?? null }) as Prisma.InputJsonValue,
                  userId: ctx.userId,
                },
              });
            }
            return result;
          });
        },
      },
    },
  });
}

export type AppDb = ReturnType<typeof createDb>;

export const tenantContext = (companyId: string, userId: string | null): DbContext => ({
  kind: "tenant",
  companyId,
  userId,
});

export const systemContext = (reason: string, userId: string | null = null): DbContext => ({
  kind: "system",
  userId,
  reason,
});

/** System-context client (RLS bypass). Every caller states why — it shows up in code review. */
export function systemDb(reason: string, userId: string | null = null) {
  return createDb(systemContext(reason, userId));
}
