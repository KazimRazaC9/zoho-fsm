import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { dbFor, requireBuiltinRole, requireUser } from "@/lib/auth";
import { rolesService } from "@/modules/roles";
import { RolesManager } from "./roles-manager";

export const metadata: Metadata = { title: "Role management" };

export default async function RolesPage() {
  const user = await requireUser();
  requireBuiltinRole(user, ["ADMIN"]);
  const roles = await rolesService.list(dbFor(user));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Role management</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Create staff roles and choose exactly what each role can view, create, edit, and delete.
          </p>
        </div>
      </div>
      <Card className="p-5">
        <RolesManager roles={roles} />
      </Card>
    </div>
  );
}
