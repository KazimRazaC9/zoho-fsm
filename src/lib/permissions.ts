import type { AppRole } from "./roles";

export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_RESOURCES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "requests", label: "Service requests" },
  { key: "workOrders", label: "Work orders" },
  { key: "dispatch", label: "Dispatch board" },
  { key: "customers", label: "Customers" },
  { key: "assets", label: "Assets" },
  { key: "estimates", label: "Estimates" },
  { key: "invoices", label: "Invoices" },
  { key: "maintenance", label: "Maintenance plans" },
  { key: "reports", label: "Reports" },
  { key: "users", label: "Users & technicians" },
  { key: "catalog", label: "Service catalog" },
  { key: "checklists", label: "Checklist templates" },
  { key: "settings", label: "Company settings" },
  { key: "field", label: "Field app" },
] as const;

export type PermissionResource = (typeof PERMISSION_RESOURCES)[number]["key"];

/** Single-purpose permissions that do not fit the view/create/edit/delete grid. */
export const PERMISSION_EXTRAS = [
  {
    key: "workOrders:close",
    label: "QA: verify and close work orders",
    hint: "Close a completed work order, or send it back for rework.",
  },
] as const;
export type ExtraPermission = (typeof PERMISSION_EXTRAS)[number]["key"];

export type AppPermission = `${PermissionResource}:${PermissionAction}` | ExtraPermission;
/** One permission, or a list where holding ANY of them is enough. */
export type PermissionRule = AppPermission | readonly AppPermission[];

export const PERMISSIONS: AppPermission[] = [
  ...PERMISSION_RESOURCES.flatMap(({ key }) => PERMISSION_ACTIONS.map((action) => `${key}:${action}` as AppPermission)),
  ...PERMISSION_EXTRAS.map((extra) => extra.key as AppPermission),
];

type Holder = { role: string; customRoleId: string | null; permissions: readonly AppPermission[] };

/**
 * QA: may close a completed work order or send it back. Built-in Admin and Dispatcher can by
 * default; a custom role needs the explicit "workOrders:close" permission; technicians never can.
 */
export function canQa(user: Holder): boolean {
  if (user.customRoleId) return user.permissions.includes("workOrders:close");
  return user.role === "ADMIN" || user.role === "DISPATCHER";
}

const API_RESOURCES: Record<string, PermissionResource> = {
  assets: "assets",
  "checklist-templates": "checklists",
  customers: "customers",
  dispatch: "dispatch",
  estimates: "estimates",
  invoices: "invoices",
  requests: "requests",
  "service-items": "catalog",
  users: "users",
  "work-orders": "workOrders",
  attachments: "workOrders",
  "company/settings": "settings",
  field: "field",
};

export function permissionForApi(pathname: string, method: string): PermissionRule | null {
  const path = pathname.replace(/^\/api\/v1\/?/, "");
  if (/^work-orders\/[^/]+\/invoice$/.test(path) && method !== "GET") return "invoices:create";
  // Same permission the screen asks for, so the API and the UI can never disagree.
  if (/^work-orders\/[^/]+\/schedule$/.test(path)) return method === "GET" ? "dispatch:view" : "dispatch:edit";
  if (/^work-orders\/[^/]+\/status$/.test(path) && method === "POST") return ["workOrders:edit", "workOrders:close"];
  if (/^(requests|estimates)\/[^/]+\/convert$/.test(path) && method === "POST") return "workOrders:create";
  const resource =
    API_RESOURCES[Object.keys(API_RESOURCES).find((key) => path === key || path.startsWith(`${key}/`)) ?? ""];
  if (!resource) return null;

  // Files of a job are shown to the office (work orders) and to the technician it is assigned to (field).
  if (resource === "workOrders" && /^attachments\//.test(path) && method === "GET")
    return ["workOrders:view", "field:view"];
  const segments = path.split("/").filter(Boolean);
  const hasRecordId = segments.length > 1 && segments[1] !== "summary" && segments[1] !== "board";
  const action: PermissionAction =
    method === "GET" || method === "HEAD"
      ? "view"
      : method === "DELETE"
        ? "delete"
        : method === "POST" && !hasRecordId
          ? "create"
          : "edit";
  return `${resource}:${action}`;
}

export function permissionForPage(pathname: string): AppPermission | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const routes: Record<string, PermissionResource> = {
    "/dashboard": "dashboard",
    "/requests": "requests",
    "/work-orders": "workOrders",
    "/dispatch": "dispatch",
    "/live-map": "dispatch",
    "/customers": "customers",
    "/assets": "assets",
    "/estimates": "estimates",
    "/invoices": "invoices",
    "/maintenance": "maintenance",
    "/reports": "reports",
    "/users": "users",
    "/catalog": "catalog",
    "/checklists": "checklists",
    "/settings": "settings",
    "/roles": "users",
    "/my-jobs": "field",
  };
  const route = Object.keys(routes).find((key) => path === key || path.startsWith(`${key}/`));
  return route ? `${routes[route]}:view` : null;
}

export function parsePermissions(value: unknown): AppPermission[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (permission): permission is AppPermission =>
      typeof permission === "string" && PERMISSIONS.includes(permission as AppPermission),
  );
}

export function hasPermission(permissions: readonly AppPermission[], permission: AppPermission): boolean {
  return permissions.includes(permission);
}

export function homeForPermissions(role: AppRole, permissions: readonly AppPermission[]): string {
  const allowedPaths: Partial<Record<AppRole, string[]>> = {
    ADMIN: [
      "/dashboard",
      "/requests",
      "/work-orders",
      "/dispatch",
      "/live-map",
      "/customers",
      "/assets",
      "/estimates",
      "/invoices",
      "/maintenance",
      "/reports",
      "/users",
      "/catalog",
      "/checklists",
      "/settings",
    ],
    DISPATCHER: [
      "/dashboard",
      "/requests",
      "/work-orders",
      "/dispatch",
      "/live-map",
      "/customers",
      "/assets",
      "/estimates",
      "/invoices",
    ],
    TECHNICIAN: ["/my-jobs"],
  };
  return (
    allowedPaths[role]?.find((path) => {
      const permission = permissionForPage(path);
      return permission !== null && hasPermission(permissions, permission);
    }) ?? "/account"
  );
}
