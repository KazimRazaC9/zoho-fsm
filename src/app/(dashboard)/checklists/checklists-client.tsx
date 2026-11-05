"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { deleteChecklistTemplateAction, saveChecklistTemplateAction } from "@/modules/checklists/checklists.actions";
import type { ChecklistTemplateDto } from "@/modules/checklists/checklists.schema";

function TemplateSheet({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template?: ChecklistTemplateDto;
}) {
  const [name, setName] = useState("");
  const [items, setItems] = useState("");
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(template?.name ?? "");
      setItems(template?.items.join("\n") ?? "");
      setActive(template?.isActive ?? true);
      setErrors({});
    }
  }, [open, template]);

  const save = async () => {
    setBusy(true);
    const list = items
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await saveChecklistTemplateAction(template?.id ?? null, { name, items: list, isActive: active });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      toast.error(res.error);
      return;
    }
    toast.success(template ? "Template saved." : "Template created.");
    onOpenChange(false);
  };

  const itemError = Object.entries(errors).find(([k]) => k.startsWith("data.items") || k.startsWith("items"))?.[1]?.[0];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{template ? `Edit ${template.name}` : "New checklist template"}</SheetTitle>
          <SheetDescription>
            Applied to work orders as a copy, so editing a template does not change jobs that already use it.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <Field label="Name" htmlFor="tpl-name" error={(errors["data.name"] ?? errors.name)?.[0]}>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="MDVR installation"
            />
          </Field>
          <Field label="Items — one per line" htmlFor="tpl-items" error={itemError}>
            <Textarea id="tpl-items" rows={12} value={items} onChange={(e) => setItems(e.target.value)} />
          </Field>
          <div className="flex items-center gap-2">
            <Switch id="tpl-active" checked={active} onCheckedChange={setActive} />
            <Label htmlFor="tpl-active" className="font-normal">
              Active (shown when creating work orders)
            </Label>
          </div>
        </div>
        <SheetFooter>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {template ? "Save template" : "Create template"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function NewTemplateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> New template
      </Button>
      <TemplateSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

export function TemplateActions({ template }: { template: ChecklistTemplateDto }) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const close = (o: boolean) => !o && setDialog(null);
  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" aria-label={`Edit ${template.name}`} onClick={() => setDialog("edit")}>
        <Pencil />
      </Button>
      <Button variant="ghost" size="icon" aria-label={`Delete ${template.name}`} onClick={() => setDialog("delete")}>
        <Trash2 />
      </Button>
      <TemplateSheet open={dialog === "edit"} onOpenChange={close} template={template} />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={close}
        title={`Delete ${template.name}?`}
        description="Work orders that already have these items keep them."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const res = await deleteChecklistTemplateAction(template.id);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success("Template deleted.");
        }}
      />
    </div>
  );
}
