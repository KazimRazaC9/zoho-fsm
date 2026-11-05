/** Role helpers shared by middleware (edge), server and client code. No server imports here. */
export const ROLES = ["SUPER_ADMIN", "ADMIN", "DISPATCHER", "TECHNICIAN", "CUSTOMER"] as const;
export type AppRole = (typeof ROLES)[number];

export const STAFF: AppRole[] = ["ADMIN", "DISPATCHER"];

export const ROLE_LABEL: Record<AppRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  DISPATCHER: "Dispatcher",
  TECHNICIAN: "Technician",
  CUSTOMER: "Customer",
};

/** Where each role lands after sign-in. */
export function homeFor(role: AppRole): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/companies";
    case "TECHNICIAN":
      return "/my-jobs";
    case "CUSTOMER":
      return "/portal";
    default:
      return "/dashboard";
  }
}
