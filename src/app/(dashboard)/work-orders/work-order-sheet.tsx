"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { handleResult } from "@/components/forms/apply-server-errors";
import { Field, NativeSelect } from "@/components/forms/field";
import { JobTargetFields } from "@/components/forms/job-target-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { PRIORITY_LABEL } from "@/lib/statuses";
import type { ChecklistTemplateOption } from "@/modules/checklists/checklists.schema";
import type { CustomerOption } from "@/modules/customers/customers.schema";
import { createWorkOrderAction, updateWorkOrderAction } from "@/modules/work-orders/work-orders.actions";
import {
  createWorkOrderSchema,
  PRIORITIES,
  workOrderSchema,
  type CreateWorkOrderInput,
  type WorkOrderDetail,
} from "@/modules/work-orders/work-orders.schema";

const blank = (customerId = ""): CreateWorkOrderInput => ({
  customerId,
  addressId: "",
  assetId: "",
  title: "",
  description: "",
  zohoTicket: "",
  purchaseOrder: "",
  priority: "MEDIUM",
  dueDate: "",
  checklistTemplateId: "",
});

const fromDetail = (w: WorkOrderDetail): CreateWorkOrderInput => ({
  customerId: w.customerId,
  addressId: w.address?.id ?? "",
  assetId: w.assetId ?? "",
  title: w.title,
  description: w.description ?? "",
  zohoTicket: w.zohoTicket ?? "",
  purchaseOrder: w.purchaseOrder ?? "",
  priority: w.priority,
  dueDate: w.dueDateLocal,
  checklistTemplateId: "",
});

export function WorkOrderSheet({
  open,
  onOpenChange,
  customers,
  templates = [],
  workOrder,
  customerId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customers: CustomerOption[];
  templates?: ChecklistTemplateOption[];
  workOrder?: WorkOrderDetail;
  customerId?: string;
}) {
  const router = useRouter();
  const editing = !!workOrder;
  const form = useForm<CreateWorkOrderInput>({
    resolver: zodResolver(
      editing ? workOrderSchema : createWorkOrderSchema,
    ) as unknown as Resolver<CreateWorkOrderInput>,
    defaultValues: blank(customerId),
  });
  const { register, handleSubmit, reset, setError, formState } = form;
  const e = formState.errors;

  useEffect(() => {
    if (open) reset(workOrder ? fromDetail(workOrder) : blank(customerId));
  }, [open, workOrder, customerId, reset]);

  const onSubmit = handleSubmit(async (v) => {
    if (editing) {
      const res = await updateWorkOrderAction(workOrder.id, v);
      if (handleResult(res, setError, "Work order saved.")) onOpenChange(false);
      return;
    }
    const res = await createWorkOrderAction(v);
    if (handleResult(res, setError, res.ok ? `${res.data.number} created.` : undefined)) {
      onOpenChange(false);
      router.push(`/work-orders/${res.data.id}`);
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{editing ? `Edit ${workOrder.number}` : "New work order"}</SheetTitle>
          <SheetDescription>
            {editing
              ? "Details of the job. Lines, checklist and files are edited on the page."
              : "Numbered automatically (WO-000123)."}
          </SheetDescription>
        </SheetHeader>
        <form id="wo-form" onSubmit={onSubmit} noValidate className="space-y-4 px-4">
          <JobTargetFields form={form} customers={customers} idPrefix="wo" />
          <Field label="Title" htmlFor="wo-title" error={e.title?.message}>
            <Input id="wo-title" {...register("title")} aria-invalid={!!e.title} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Zoho ticket" htmlFor="wo-zoho" hint="Optional" error={e.zohoTicket?.message}>
              <Input id="wo-zoho" type="text" placeholder="Ticket number or link" {...register("zohoTicket")} />
            </Field>
            <Field label="Purchase order (PO)" htmlFor="wo-po" hint="Optional" error={e.purchaseOrder?.message}>
              <Input id="wo-po" type="text" placeholder="Customer PO number" {...register("purchaseOrder")} />
            </Field>
          </div>
          <Field label="Description" htmlFor="wo-desc" error={e.description?.message}>
            <Textarea id="wo-desc" rows={4} {...register("description")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Priority" htmlFor="wo-priority">
              <NativeSelect id="wo-priority" {...register("priority")}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Due" htmlFor="wo-due" error={e.dueDate?.message}>
              <Input id="wo-due" type="datetime-local" {...register("dueDate")} />
            </Field>
          </div>
          {!editing && (
            <Field label="Checklist" htmlFor="wo-template">
              <NativeSelect id="wo-template" {...register("checklistTemplateId")}>
                <option value="">No checklist</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.itemCount} items)
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
        </form>
        <SheetFooter>
          <Button type="submit" form="wo-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            {editing ? "Save changes" : "Create work order"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function NewWorkOrderButton(props: { customers: CustomerOption[]; templates: ChecklistTemplateOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> New work order
      </Button>
      <WorkOrderSheet open={open} onOpenChange={setOpen} {...props} />
    </>
  );
}
