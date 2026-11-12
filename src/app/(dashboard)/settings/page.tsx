import type { Metadata } from "next";
import { CompanySettingsForm } from "./company-settings-form";
import { dbFor, requirePagePermission, requireRole, requireUser } from "@/lib/auth";
import { companiesService } from "@/modules/companies";

export const metadata: Metadata = { title: "Company settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  requireRole(user, ["ADMIN"]);
  requirePagePermission(user, "/settings");
  const company = await companiesService.getSettings(dbFor(user), user);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Company settings</h1>
        <p className="text-muted-foreground text-sm">Profile, time zone, currency and tax for {company.name}.</p>
      </div>
      <CompanySettingsForm company={company} />
    </div>
  );
}
