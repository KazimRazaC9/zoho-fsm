/**
 * Pure argument rewriting for the tenant extension (no Prisma client here, so it is unit-testable).
 * Given a model + operation + args, returns the args with tenant scope, soft-delete filter and
 * audit stamps applied.
 */

export type DbContext =
  | { kind: "tenant"; companyId: string; userId: string | null }
  | { kind: "system"; userId: string | null; reason: string };

/** Models whose rows belong to exactly one company (non-null companyId). */
export const TENANT_MODELS = new Set<string>([
  "TechnicianProfile",
  "Customer",
  "ServiceAddress",
  "Project",
  "Asset",
  "ServiceItem",
  "ServiceRequest",
  "Estimate",
  "EstimateLine",
  "WorkOrder",
  "WorkOrderLine",
  "WorkOrderNote",
  "ChecklistTemplate",
  "ChecklistTemplateItem",
  "WorkOrderChecklistItem",
  "Appointment",
  "TimeSheet",
  "Attachment",
  "WorkOrderIssue",
  "WorkOrderServiceForm",
  "TechnicianLocation",
  "Invoice",
  "InvoiceLine",
  "Payment",
  "MaintenancePlan",
  "Notification",
  "NumberSequence",
  "WorkOrderStatusChange",
  // nullable companyId, but always scoped for tenant callers:
  "User",
  "AuditLog",
]);

/** Models with a deletedAt column (delete = soft delete, reads hide deleted rows). */
export const SOFT_DELETE_MODELS = new Set<string>([
  "Company",
  "User",
  "TechnicianProfile",
  "Customer",
  "ServiceAddress",
  "Project",
  "Asset",
  "ServiceItem",
  "ServiceRequest",
  "Estimate",
  "EstimateLine",
  "WorkOrder",
  "WorkOrderLine",
  "WorkOrderNote",
  "ChecklistTemplate",
  "ChecklistTemplateItem",
  "WorkOrderChecklistItem",
  "Appointment",
  "TimeSheet",
  "Attachment",
  "WorkOrderIssue",
  "WorkOrderServiceForm",
  "TechnicianLocation",
  "Invoice",
  "InvoiceLine",
  "Payment",
  "MaintenancePlan",
  "Notification",
]);

/** Models with createdById/updatedById columns. */
const STAMPED_MODELS = SOFT_DELETE_MODELS;

/** Writes to these are recorded in AuditLog. */
export const AUDITED_MODELS = new Set<string>(
  [...SOFT_DELETE_MODELS].filter((m) => !["TechnicianLocation", "Notification"].includes(m)),
);

const READ_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);
const SCOPED_WRITE_OPS = new Set(["update", "updateMany", "updateManyAndReturn", "delete", "deleteMany", "upsert"]);

type Args = Record<string, unknown> & { where?: Record<string, unknown>; data?: unknown };

export function isTenantModel(model: string) {
  return TENANT_MODELS.has(model);
}

/** The where-clause additions for this model in this context. */
export function scopeWhere(model: string, ctx: DbContext, where: Record<string, unknown> | undefined) {
  const next: Record<string, unknown> = { ...(where ?? {}) };
  if (ctx.kind === "tenant") {
    if (model === "Company") next.id = ctx.companyId;
    else if (TENANT_MODELS.has(model)) next.companyId = ctx.companyId;
  }
  if (SOFT_DELETE_MODELS.has(model) && !("deletedAt" in next)) next.deletedAt = null;
  return next;
}

function stampCreate(model: string, ctx: DbContext, data: unknown): unknown {
  if (Array.isArray(data)) return data.map((d) => stampCreate(model, ctx, d));
  if (!data || typeof data !== "object") return data;
  const row = { ...(data as Record<string, unknown>) };

  if (ctx.kind === "tenant" && TENANT_MODELS.has(model)) {
    // A relation-style connect (company: { connect }) is not allowed for tenant callers: always our company.
    if ("company" in row) delete row.company;
    if (row.companyId !== undefined && row.companyId !== ctx.companyId) {
      throw new CrossTenantWriteError(model);
    }
    row.companyId = ctx.companyId;
  }
  if (STAMPED_MODELS.has(model)) {
    row.createdById ??= ctx.userId;
    row.updatedById ??= ctx.userId;
  }
  return row;
}

function stampUpdate(model: string, ctx: DbContext, data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const row = { ...(data as Record<string, unknown>) };
  if (ctx.kind === "tenant" && TENANT_MODELS.has(model) && "companyId" in row && row.companyId !== ctx.companyId) {
    throw new CrossTenantWriteError(model);
  }
  if (STAMPED_MODELS.has(model)) row.updatedById = ctx.userId;
  return row;
}

export class CrossTenantWriteError extends Error {
  constructor(model: string) {
    super(`Cross-tenant write blocked on ${model}.`);
    this.name = "CrossTenantWriteError";
  }
}

export type RewrittenOp = { operation: string; args: Args };

/**
 * Rewrites one model operation. `delete`/`deleteMany` on soft-delete models become
 * `update`/`updateMany` that set deletedAt.
 */
export function rewriteOperation(model: string, operation: string, rawArgs: unknown, ctx: DbContext): RewrittenOp {
  const args: Args = { ...((rawArgs as Args | undefined) ?? {}) };

  if (READ_OPS.has(operation)) {
    args.where = scopeWhere(model, ctx, args.where);
    return { operation, args };
  }

  if (operation === "create") {
    args.data = stampCreate(model, ctx, args.data);
    return { operation, args };
  }

  if (operation === "createMany" || operation === "createManyAndReturn") {
    args.data = stampCreate(model, ctx, args.data);
    return { operation, args };
  }

  if (SCOPED_WRITE_OPS.has(operation)) {
    args.where = scopeWhere(model, ctx, args.where);

    if (operation === "upsert") {
      const upsert = args as Args & { create?: unknown; update?: unknown };
      upsert.create = stampCreate(model, ctx, upsert.create);
      upsert.update = stampUpdate(model, ctx, upsert.update);
      return { operation, args: upsert };
    }

    if ((operation === "delete" || operation === "deleteMany") && SOFT_DELETE_MODELS.has(model)) {
      const data: Record<string, unknown> = { deletedAt: new Date() };
      if (STAMPED_MODELS.has(model)) data.updatedById = ctx.userId;
      return { operation: operation === "delete" ? "update" : "updateMany", args: { where: args.where, data } };
    }

    if (operation.startsWith("update")) args.data = stampUpdate(model, ctx, args.data);
    return { operation, args };
  }

  return { operation, args };
}

/** Values safe to store in AuditLog (no secrets; Decimal/Date → JSON). */
export function auditSnapshot(value: unknown): unknown {
  if (value == null) return null;
  const plain = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  if (plain && typeof plain === "object") delete plain.passwordHash;
  return plain;
}
