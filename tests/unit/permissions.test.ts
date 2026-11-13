import { describe, expect, it } from "vitest";
import {
  canQa,
  hasPermission,
  homeForPermissions,
  parsePermissions,
  permissionForApi,
  permissionForPage,
} from "@/lib/permissions";
import { customRoleSchema } from "@/modules/roles/roles.schema";

describe("custom role permissions", () => {
  it("maps dashboard pages to view permissions", () => {
    expect(permissionForPage("/work-orders/wo_1")).toBe("workOrders:view");
    expect(permissionForPage("/my-jobs/wo_1")).toBe("field:view");
    expect(permissionForPage("/not-a-module")).toBeNull();
  });

  it("maps API methods and record actions to the correct permission", () => {
    expect(permissionForApi("/api/v1/customers", "POST")).toBe("customers:create");
    expect(permissionForApi("/api/v1/work-orders/wo_1/status", "POST")).toEqual([
      "workOrders:edit",
      "workOrders:close",
    ]);
    // The API asks for the same permission the screen does.
    expect(permissionForApi("/api/v1/work-orders/wo_1/schedule", "PUT")).toBe("dispatch:edit");
    expect(permissionForApi("/api/v1/work-orders/wo_1/schedule", "DELETE")).toBe("dispatch:edit");
    expect(permissionForApi("/api/v1/requests/sr_1/convert", "POST")).toBe("workOrders:create");
    expect(permissionForApi("/api/v1/estimates/es_1/convert", "POST")).toBe("workOrders:create");
    expect(permissionForApi("/api/v1/assets/asset_1", "DELETE")).toBe("assets:delete");
    expect(permissionForApi("/api/v1/unknown", "GET")).toBeNull();
  });

  it("validates and safely parses stored permissions", () => {
    const permissions = ["customers:view", "customers:create"] as const;
    expect(
      customRoleSchema.parse({
        name: "Customer Care",
        description: "",
        baseRole: "DISPATCHER",
        permissions,
      }).permissions,
    ).toEqual(permissions);
    expect(
      customRoleSchema.safeParse({
        name: "Invalid",
        baseRole: "SUPER_ADMIN",
        permissions: ["companies:delete"],
      }).success,
    ).toBe(false);
    expect(parsePermissions(["customers:view", "unknown:execute", 3])).toEqual(["customers:view"]);
    expect(hasPermission(parsePermissions(permissions), "customers:create")).toBe(true);
  });

  it("knows who counts as QA", () => {
    const base = { customRoleId: null, permissions: [] as never[] };
    expect(canQa({ ...base, role: "ADMIN" })).toBe(true);
    expect(canQa({ ...base, role: "DISPATCHER" })).toBe(true);
    expect(canQa({ ...base, role: "TECHNICIAN" })).toBe(false);
    // A custom role is QA only when it holds the permission, whatever its staff type.
    expect(canQa({ role: "DISPATCHER", customRoleId: "r1", permissions: ["workOrders:edit"] })).toBe(false);
    expect(canQa({ role: "DISPATCHER", customRoleId: "r1", permissions: ["workOrders:close"] })).toBe(true);
    expect(parsePermissions(["workOrders:close", "workOrders:approve"])).toEqual(["workOrders:close"]);
  });

  it("chooses a home page the assigned staff type is allowed to open", () => {
    expect(homeForPermissions("DISPATCHER", ["workOrders:view"])).toBe("/work-orders");
    expect(homeForPermissions("TECHNICIAN", ["dashboard:view"])).toBe("/account");
    expect(homeForPermissions("TECHNICIAN", ["field:view"])).toBe("/my-jobs");
  });
});
