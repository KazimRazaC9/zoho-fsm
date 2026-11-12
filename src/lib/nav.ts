import type { AppRole } from "./roles";

/**
 * The dashboard menu and the role that may open each area. Middleware (edge) and the sidebar
 * both read this, so a menu item and its route guard can never disagree.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  roles: AppRole[];
  /** Phase that delivers the screen (shown on screens not built yet). */
  phase: number;
  group: "Operations" | "Customers" | "Billing" | "Insights" | "Admin" | "Platform" | "Field";
};

export type NavIcon =
  | "dashboard"
  | "requests"
  | "workOrders"
  | "dispatch"
  | "map"
  | "customers"
  | "assets"
  | "estimates"
  | "invoices"
  | "maintenance"
  | "reports"
  | "users"
  | "catalog"
  | "settings"
  | "companies"
  | "jobs"
  | "checklists"
  | "roles";

const OPS: AppRole[] = ["ADMIN", "DISPATCHER"];
const ADMIN: AppRole[] = ["ADMIN"];

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: OPS, phase: 8, group: "Operations" },
  { href: "/requests", label: "Service requests", icon: "requests", roles: OPS, phase: 3, group: "Operations" },
  { href: "/work-orders", label: "Work orders", icon: "workOrders", roles: OPS, phase: 3, group: "Operations" },
  { href: "/dispatch", label: "Dispatch board", icon: "dispatch", roles: OPS, phase: 4, group: "Operations" },
  { href: "/live-map", label: "Live map", icon: "map", roles: OPS, phase: 5, group: "Operations" },
  { href: "/customers", label: "Customers", icon: "customers", roles: OPS, phase: 2, group: "Customers" },
  { href: "/assets", label: "Assets", icon: "assets", roles: OPS, phase: 2, group: "Customers" },
  { href: "/estimates", label: "Estimates", icon: "estimates", roles: OPS, phase: 6, group: "Billing" },
  { href: "/invoices", label: "Invoices", icon: "invoices", roles: OPS, phase: 6, group: "Billing" },
  { href: "/maintenance", label: "Maintenance plans", icon: "maintenance", roles: ADMIN, phase: 7, group: "Billing" },
  { href: "/reports", label: "Reports", icon: "reports", roles: ADMIN, phase: 8, group: "Insights" },
  { href: "/users", label: "Users & technicians", icon: "users", roles: ADMIN, phase: 1, group: "Admin" },
  { href: "/roles", label: "Role management", icon: "roles", roles: ADMIN, phase: 1, group: "Admin" },
  { href: "/catalog", label: "Service catalog", icon: "catalog", roles: ADMIN, phase: 2, group: "Admin" },
  { href: "/checklists", label: "Checklist templates", icon: "checklists", roles: ADMIN, phase: 3, group: "Admin" },
  { href: "/settings", label: "Company settings", icon: "settings", roles: ADMIN, phase: 1, group: "Admin" },
  { href: "/companies", label: "Companies", icon: "companies", roles: ["SUPER_ADMIN"], phase: 1, group: "Platform" },
  { href: "/my-jobs", label: "My jobs", icon: "jobs", roles: ["TECHNICIAN"], phase: 5, group: "Field" },
];

/** The nav item that owns a path (longest matching prefix). */
export function navItemFor(pathname: string): NavItem | undefined {
  return NAV.filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}

export const navFor = (role: AppRole) => NAV.filter((n) => n.roles.includes(role));
