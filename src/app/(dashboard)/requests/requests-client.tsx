"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightCircle, Ban, FileText, Loader2, MoreHorizontal, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { handleResult } from "@/components/forms/apply-server-errors";
import { Field, NativeSelect } from "@/components/forms/field";
import { JobTargetFields } from "@/components/forms/job-target-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { PRIORITY_LABEL } from "@/lib/statuses";
import type { ChecklistTemplateOption } from "@/modules/checklists/checklists.schema";
import type { CustomerOption } from "@/modules/customers/customers.schema";
import { cancelRequestAction, convertRequestAction, saveRequestAction } from "@/modules/requests/requests.actions";
import {
  convertRequestSchema,
  CATEGORY_LABEL,
  REQUEST_CATEGORIES,
  REQUEST_SOURCES,
  requestSchema,
  requestToInput,
  SOURCE_LABEL,
  type ConvertRequestInput,
  type RequestDto,
  type RequestInput,
} from "@/modules/requests/requests.schema";
import { PRIORITIES } from "@/modules/work-orders/work-orders.schema";

const blank: RequestInput = {
  customerId: "",
  addressId: "",
  assetId: "",
  title: "",
  description: "",
  priority: "MEDIUM",
  source: "PHONE",
  category: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  preferredAt: "",
};

export function NewRequestButton({ customers }: { customers: CustomerOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> New request
      </Button>
      <RequestSheet open={open} onOpenChange={setOpen} customers={customers} />
    </>
  );
}

function RequestSheet({
  open,
  onOpenChange,
  customers,
  request,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customers: CustomerOption[];
  request?: RequestDto;
}) {
  const form = useForm<RequestInput>({ resolver: zodResolver(requestSchema), defaultValues: blank });
  const { register, handleSubmit, reset, setError, formState } = form;
  const e = formState.errors;

  useEffect(() => {
    if (open) reset(request ? requestToInput(request) : blank);
  }, [open, request, reset]);

  const onSubmit = handleSubmit(async (v) => {
    const res = await saveRequestAction(request?.id ?? null, v);
    if (handleResult(res, setError, request ? "Request saved." : `${res.ok ? res.data.number : ""} logged.`))
      onOpenChange(false);
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{request ? `Edit ${request.number}` : "New service request"}</SheetTitle>
          <SheetDescription>
            Log what the customer reported. Convert it to a work order when it is approved.
          </SheetDescription>
        </SheetHeader>
        <form id="request-form" onSubmit={onSubmit} noValidate className="space-y-4 px-4">
          <JobTargetFields form={form} customers={customers} idPrefix="rq" />
          <Field label="What is the problem?" htmlFor="rq-title" error={e.title?.message}>
            <Input
              id="rq-title"
              placeholder="MDVR rebooting while driving"
              {...register("title")}
              aria-invalid={!!e.title}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="rq-category" hint="Optional">
              <NativeSelect id="rq-category" {...register("category")}>
                <option value="">Not specified</option>
                {REQUEST_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Preferred visit time" htmlFor="rq-preferred" hint="Optional" error={e.preferredAt?.message}>
              <Input id="rq-preferred" type="datetime-local" {...register("preferredAt")} />
            </Field>
          </div>
          <Field label="Details" htmlFor="rq-desc" error={e.description?.message}>
            <Textarea
              id="rq-desc"
              rows={4}
              placeholder="Vehicle, symptoms, since when, contact on site…"
              {...register("description")}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Priority" htmlFor="rq-priority">
              <NativeSelect id="rq-priority" {...register("priority")}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Received via" htmlFor="rq-source">
              <NativeSelect id="rq-source" {...register("source")}>
                {REQUEST_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABEL[s]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <fieldset className="space-y-4 rounded-md border p-3">
            <legend className="text-muted-foreground px-1 text-xs font-medium">Who reported it (optional)</legend>
            <Field label="Contact name" htmlFor="rq-cname" error={e.contactName?.message}>
              <Input id="rq-cname" placeholder="Fleet manager, driver…" {...register("contactName")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" htmlFor="rq-cphone" error={e.contactPhone?.message}>
                <Input id="rq-cphone" type="tel" {...register("contactPhone")} />
              </Field>
              <Field label="Email" htmlFor="rq-cemail" error={e.contactEmail?.message}>
                <Input id="rq-cemail" type="email" {...register("contactEmail")} />
              </Field>
            </div>
          </fieldset>
        </form>
        <SheetFooter>
          <Button type="submit" form="request-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            {request ? "Save changes" : "Log request"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ConvertDialog({
  request,
  templates,
  open,
  onOpenChange,
}: {
  request: RequestDto;
  templates: ChecklistTemplateOption[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const form = useForm<ConvertRequestInput>({
    resolver: zodResolver(convertRequestSchema),
    defaultValues: { checklistTemplateId: "", dueDate: "" },
  });
  const { register, handleSubmit, setError, formState, reset } = form;

  useEffect(() => {
    if (open) reset({ checklistTemplateId: templates.length === 1 ? templates[0].id : "", dueDate: "" });
  }, [open, templates, reset]);

  const onSubmit = handleSubmit(async (v) => {
    const res = await convertRequestAction(request.id, v);
    if (handleResult(res, setError, res.ok ? `${request.number} → ${res.data.number}` : undefined)) {
      onOpenChange(false);
      router.push(`/work-orders/${res.data.id}`);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert {request.number} to a work order</DialogTitle>
          <DialogDescription>
            The work order gets the customer, site, asset, title and priority of “{request.title}”.
          </DialogDescription>
        </DialogHeader>
        <form id="convert-form" onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label="Checklist" htmlFor="cv-template" hint="Copied onto the work order; you can edit it there.">
            <NativeSelect id="cv-template" {...register("checklistTemplateId")}>
              <option value="">No checklist</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.itemCount} items)
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Due" htmlFor="cv-due" error={formState.errors.dueDate?.message}>
            <Input id="cv-due" type="datetime-local" {...register("dueDate")} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="convert-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            Create work order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RequestRowActions({
  request,
  customers,
  templates,
}: {
  request: RequestDto;
  customers: CustomerOption[];
  templates: ChecklistTemplateOption[];
}) {
  const [dialog, setDialog] = useState<"edit" | "convert" | "cancel" | null>(null);
  const close = (o: boolean) => !o && setDialog(null);
  const open = request.status === "NEW" || request.status === "ESTIMATED";
  if (!open) return null;

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Button size="sm" variant="outline" onClick={() => setDialog("convert")}>
          <ArrowRightCircle /> Convert
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${request.number}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/estimates?request=${request.id}`}>
                <FileText /> Create estimate
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog("edit")}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog("cancel")}>
              <Ban /> Cancel request
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <RequestSheet open={dialog === "edit"} onOpenChange={close} customers={customers} request={request} />
      <ConvertDialog request={request} templates={templates} open={dialog === "convert"} onOpenChange={close} />
      <ConfirmDialog
        open={dialog === "cancel"}
        onOpenChange={close}
        title={`Cancel ${request.number}?`}
        description="It leaves the intake queue. You can still find it under the Cancelled filter."
        confirmLabel="Cancel request"
        destructive
        onConfirm={async () => {
          const res = await cancelRequestAction(request.id);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success(`${request.number} cancelled.`);
        }}
      />
    </>
  );
}
