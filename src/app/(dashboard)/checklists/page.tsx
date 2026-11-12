import type { Metadata } from "next";
import { NewTemplateButton, TemplateActions } from "./checklists-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dbFor, requirePagePermission, requireRole, requireUser } from "@/lib/auth";
import { checklistsService } from "@/modules/checklists";

export const metadata: Metadata = { title: "Checklist templates" };

export default async function ChecklistsPage() {
  const user = await requireUser();
  requireRole(user, ["ADMIN"]);
  requirePagePermission(user, "/checklists");
  const templates = await checklistsService.list(dbFor(user));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Checklist templates</h1>
          <p className="text-muted-foreground text-sm">
            Standard steps technicians tick off on a job. A job cannot be completed until all are done.
          </p>
        </div>
        <NewTemplateButton />
      </div>

      {templates.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">No templates yet.</CardContent>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {templates.map((t) => (
          <Card key={t.id} className={t.isActive ? undefined : "opacity-60"}>
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">{t.name}</CardTitle>
                <div className="mt-1 flex gap-2">
                  <Badge variant="secondary">{t.items.length} items</Badge>
                  {!t.isActive && <Badge variant="outline">Inactive</Badge>}
                </div>
              </div>
              <TemplateActions template={t} />
            </CardHeader>
            <CardContent>
              <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
                {t.items.map((i, n) => (
                  <li key={n}>{i}</li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
