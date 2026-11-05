import { describe, expect, it } from "vitest";
import { CrossTenantWriteError, rewriteOperation, type DbContext } from "@/lib/db-scope";

const tenant: DbContext = { kind: "tenant", companyId: "co_A", userId: "u_1" };
const system: DbContext = { kind: "system", userId: null, reason: "test" };

describe("tenant scope rewriting", () => {
  it("adds companyId and deletedAt filters to reads", () => {
    const r = rewriteOperation("Customer", "findMany", { where: { name: "x" } }, tenant);
    expect(r.args.where).toEqual({ name: "x", companyId: "co_A", deletedAt: null });
  });

  it("overrides a companyId the caller tried to read", () => {
    const r = rewriteOperation("WorkOrder", "findFirst", { where: { companyId: "co_B" } }, tenant);
    expect(r.args.where).toMatchObject({ companyId: "co_A" });
  });

  it("scopes Company to the caller's own row", () => {
    const r = rewriteOperation("Company", "findUnique", { where: { id: "co_B" } }, tenant);
    expect(r.args.where).toEqual({ id: "co_A", deletedAt: null });
  });

  it("stamps companyId and createdById on create", () => {
    const r = rewriteOperation("Customer", "create", { data: { name: "Acme" } }, tenant);
    expect(r.args.data).toMatchObject({ name: "Acme", companyId: "co_A", createdById: "u_1", updatedById: "u_1" });
  });

  it("blocks creating a row for another company", () => {
    expect(() => rewriteOperation("Customer", "create", { data: { name: "x", companyId: "co_B" } }, tenant)).toThrow(
      CrossTenantWriteError,
    );
  });

  it("blocks moving a row to another company on update", () => {
    expect(() =>
      rewriteOperation("Customer", "update", { where: { id: "1" }, data: { companyId: "co_B" } }, tenant),
    ).toThrow(CrossTenantWriteError);
  });

  it("turns delete into a soft delete", () => {
    const r = rewriteOperation("Customer", "delete", { where: { id: "c1" } }, tenant);
    expect(r.operation).toBe("update");
    expect(r.args.where).toEqual({ id: "c1", companyId: "co_A", deletedAt: null });
    expect((r.args.data as { deletedAt: Date }).deletedAt).toBeInstanceOf(Date);
  });

  it("turns deleteMany into a soft updateMany", () => {
    const r = rewriteOperation("WorkOrderNote", "deleteMany", { where: { workOrderId: "w1" } }, tenant);
    expect(r.operation).toBe("updateMany");
  });

  it("hard-deletes models without deletedAt", () => {
    const r = rewriteOperation("RefreshToken", "delete", { where: { id: "t1" } }, system);
    expect(r.operation).toBe("delete");
  });

  it("system context keeps the soft-delete filter but no company filter", () => {
    const r = rewriteOperation("Customer", "findMany", {}, system);
    expect(r.args.where).toEqual({ deletedAt: null });
  });

  it("respects an explicit deletedAt filter", () => {
    const r = rewriteOperation("Customer", "findMany", { where: { deletedAt: { not: null } } }, tenant);
    expect(r.args.where).toMatchObject({ deletedAt: { not: null } });
  });
});
