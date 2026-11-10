"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { EstimateStatus } from "@prisma/client";
import { ArrowRightCircle, Check, Loader2, Pencil, Printer, Send, Trash2, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { EstimateSheet, type RequestOption } from "../estimates-client";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DocumentLines } from "@/components/domain/document-lines";
import { handleResult } from "@/components/forms/apply-server-errors";
import { Field, NativeSelect } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { ChecklistTemplateOption } from "@/modules/checklists/checklists.schema";
import type { CustomerOption } from "@/modules/customers/customers.schema";
import type { ServiceItemDto } from "@/modules/catalog/catalog.schema";
import {
  changeEstimateStatusAction,
  convertEstimateAction,
  deleteEstimateAction,
  deleteEstimateLineAction,
  saveEstimateLineAction,
} from "@/modules/estimates/estimates.actions";
import {
  convertEstimateSchema,
  estimateToInput,
  type ConvertEstimateInput,
  type EstimateDetail,
} from "@/modules/estimates/estimates.schema";

export function EstimateLines({
  estimate,
  items,
  currency,
}: {
  estimate: EstimateDetail;
  items: ServiceItemDto[];
  currency: string;
}) {
  const router = useRouter();
  return (
    <DocumentLines
      lines={estimate.lines}
      items={items}
      currency={currency}
      totals={{ subTotal: estimate.subTotal, tax: estimate.tax, total: estimate.total }}
      editable={estimate.editable}
      lockedHint="Sent and approved estimates are locked. Use Revise to make changes."
      onSave={async (lineId, input) => {
        const res = await saveEstimateLineAction(estimate.id, lineId, input);
        if (res.ok) router.refresh();
        return res;
      }}
      onDelete={async (lineId) => {
        const res = await deleteEstimateLineAction(estimate.id, lineId);
        if (res.ok) router.refresh();
        return res;
      }}
    />
  );
}

export function EstimateActions({
  estimate,
  customers,
  requests,
  templates,
}: {
  estimate: EstimateDetail;
  customers: CustomerOption[];
  requests: RequestOption[];
  templates: ChecklistTemplateOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<EstimateStatus | null>(null);
  const [dialog, setDialog] = useState<"edit" | "convert" | "delete" | null>(null);
  const close = (o: boolean) => !o && setDialog(null);

  const move = async (status: EstimateStatus, message: string) => {
    setBusy(status);
    const res = await changeEstimateStatusAction(estimate.id, { status });
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success(message);
    router.refresh();
  };

  const Spin = (s: EstimateStatus, icon: React.ReactNode) => (busy === s ? <Loader2 className="animate-spin" /> : icon);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" asChild>
        <Link href={`/estimates/${estimate.id}/print`} target="_blank">
          <Printer /> Print / PDF
        </Link>
      </Button>
      {estimate.status === "DRAFT" && (
        <>
          <Button variant="outline" onClick={() => setDialog("edit")}>
            <Pencil /> Edit
          </Button>
          <Button variant="outline" onClick={() => setDialog("delete")} aria-label="Delete estimate">
            <Trash2 />
          </Button>
          <Button disabled={busy !== null} onClick={() => move("SENT", `${estimate.number} marked as sent.`)}>
            {Spin("SENT", <Send />)} Mark as sent
          </Button>
        </>
      )}
      {estimate.status === "SENT" && (
        <>
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => move("DRAFT", "Back to draft. You can edit it now.")}
          >
            {Spin("DRAFT", <Undo2 />)} Revise
          </Button>
          <Button variant="outline" disabled={busy !== null} onClick={() => move("REJECTED", "Marked as rejected.")}>
            {Spin("REJECTED", <X />)} Rejected
          </Button>
          <Button disabled={busy !== null} onClick={() => move("APPROVED", "Approved by the customer.")}>
            {Spin("APPROVED", <Check />)} Customer approved
          </Button>
        </>
      )}
      {estimate.status === "REJECTED" && (
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() => move("DRAFT", "Back to draft. You can edit it now.")}
        >
          {Spin("DRAFT", <Undo2 />)} Revise
        </Button>
      )}
      {estimate.status === "APPROVED" && !estimate.workOrder && (
        <Button onClick={() => setDialog("convert")}>
          <ArrowRightCircle /> Create work order
        </Button>
      )}

      <EstimateSheet
        open={dialog === "edit"}
        onOpenChange={close}
        customers={customers}
        requests={requests}
        estimate={{ id: estimate.id, number: estimate.number, value: estimateToInput(estimate) }}
      />
      <ConvertDialog estimate={estimate} templates={templates} open={dialog === "convert"} onOpenChange={close} />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={close}
        title={`Delete ${estimate.number}?`}
        description="Only drafts can be deleted. A linked service request goes back to New."
        confirmLabel="Delete estimate"
        destructive
        onConfirm={async () => {
          const res = await deleteEstimateAction(estimate.id);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success(`${estimate.number} deleted.`);
          router.push("/estimates");
        }}
      />
    </div>
  );
}

function ConvertDialog({
  estimate,
  templates,
  open,
  onOpenChange,
}: {
  estimate: EstimateDetail;
  templates: ChecklistTemplateOption[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const form = useForm<ConvertEstimateInput>({
    resolver: zodResolver(convertEstimateSchema),
    defaultValues: { checklistTemplateId: "", dueDate: "" },
  });
  const { register, handleSubmit, setError, formState, reset } = form;

  useEffect(() => {
    if (open) reset({ checklistTemplateId: templates.length === 1 ? templates[0].id : "", dueDate: "" });
  }, [open, templates, reset]);

  const onSubmit = handleSubmit(async (v) => {
    const res = await convertEstimateAction(estimate.id, v);
    if (handleResult(res, setError, res.ok ? `${estimate.number} → ${res.data.number}` : undefined)) {
      onOpenChange(false);
      router.push(`/work-orders/${res.data.id}`);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a work order from {estimate.number}</DialogTitle>
          <DialogDescription>
            The customer, site and all {estimate.lines.length} line{estimate.lines.length === 1 ? "" : "s"} are copied
            to the new work order.
          </DialogDescription>
        </DialogHeader>
        <form id="est-convert-form" onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label="Checklist" htmlFor="ec-template" hint="Copied onto the work order; you can edit it there.">
            <NativeSelect id="ec-template" {...register("checklistTemplateId")}>
              <option value="">No checklist</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.itemCount} items)
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Due" htmlFor="ec-due" error={formState.errors.dueDate?.message}>
            <Input id="ec-due" type="datetime-local" {...register("dueDate")} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="est-convert-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            Create work order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
