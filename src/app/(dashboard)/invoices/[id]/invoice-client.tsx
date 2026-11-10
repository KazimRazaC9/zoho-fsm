"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, CreditCard, Loader2, Pencil, Printer, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DocumentLines } from "@/components/domain/document-lines";
import { handleResult } from "@/components/forms/apply-server-errors";
import { Field, NativeSelect } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDay } from "@/lib/format";
import type { ServiceItemDto } from "@/modules/catalog/catalog.schema";
import {
  deleteInvoiceLineAction,
  deletePaymentAction,
  issueInvoiceAction,
  recordPaymentAction,
  saveInvoiceLineAction,
  updateInvoiceAction,
  voidInvoiceAction,
} from "@/modules/invoices/invoices.actions";
import {
  invoiceSchema,
  invoiceToInput,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  paymentSchema,
  type InvoiceDetail,
  type InvoiceInput,
  type PaymentInput,
} from "@/modules/invoices/invoices.schema";

const asNumber = (v: unknown) => (v === "" || v == null ? Number.NaN : Number(v));

export function InvoiceLines({
  invoice,
  items,
  currency,
  canWrite,
}: {
  invoice: InvoiceDetail;
  items: ServiceItemDto[];
  currency: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  return (
    <DocumentLines
      lines={invoice.lines}
      items={items}
      currency={currency}
      totals={{ subTotal: invoice.subTotal, tax: invoice.tax, discount: invoice.discount, total: invoice.total }}
      editable={invoice.editable && canWrite}
      lockedHint={invoice.status === "DRAFT" ? "Only an Admin can edit an invoice." : "Issued invoices are locked."}
      onSave={async (lineId, input) => {
        const res = await saveInvoiceLineAction(invoice.id, lineId, input);
        if (res.ok) router.refresh();
        return res;
      }}
      onDelete={async (lineId) => {
        const res = await deleteInvoiceLineAction(invoice.id, lineId);
        if (res.ok) router.refresh();
        return res;
      }}
    />
  );
}

export function InvoiceActions({
  invoice,
  canWrite,
  currency,
}: {
  invoice: InvoiceDetail;
  canWrite: boolean;
  currency: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"details" | "pay" | "void" | "issue" | null>(null);
  const close = (o: boolean) => !o && setDialog(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" asChild>
        <Link href={`/invoices/${invoice.id}/print`} target="_blank">
          <Printer /> Print / PDF
        </Link>
      </Button>
      {canWrite && invoice.status !== "VOID" && (
        <Button variant="outline" onClick={() => setDialog("details")}>
          <Pencil /> Terms & discount
        </Button>
      )}
      {canWrite && invoice.canVoid && (
        <Button variant="outline" onClick={() => setDialog("void")}>
          <Ban /> Void
        </Button>
      )}
      {canWrite && invoice.status === "DRAFT" && (
        <Button onClick={() => setDialog("issue")}>
          <Send /> Issue invoice
        </Button>
      )}
      {canWrite && invoice.canPay && (
        <Button onClick={() => setDialog("pay")}>
          <CreditCard /> Record payment
        </Button>
      )}

      <DetailsDialog invoice={invoice} open={dialog === "details"} onOpenChange={close} currency={currency} />
      <PaymentDialog invoice={invoice} open={dialog === "pay"} onOpenChange={close} currency={currency} />
      <ConfirmDialog
        open={dialog === "issue"}
        onOpenChange={close}
        title={`Issue ${invoice.number}?`}
        description="Once issued, the lines and discount are locked and payments can be recorded. You can still void it while nothing is paid."
        confirmLabel="Issue invoice"
        onConfirm={async () => {
          const res = await issueInvoiceAction(invoice.id);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success(`${invoice.number} issued.`);
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={dialog === "void"}
        onOpenChange={close}
        title={`Void ${invoice.number}?`}
        description="It keeps its number but no longer counts. The work order can be invoiced again."
        confirmLabel="Void invoice"
        destructive
        onConfirm={async () => {
          const res = await voidInvoiceAction(invoice.id);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success(`${invoice.number} voided.`);
          router.refresh();
        }}
      />
    </div>
  );
}

function DetailsDialog({
  invoice,
  open,
  onOpenChange,
  currency,
}: {
  invoice: InvoiceDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currency: string;
}) {
  const router = useRouter();
  const form = useForm<InvoiceInput>({ resolver: zodResolver(invoiceSchema), defaultValues: invoiceToInput(invoice) });
  const { register, handleSubmit, reset, setError, formState } = form;
  const e = formState.errors;
  const locked = invoice.status !== "DRAFT";

  useEffect(() => {
    if (open) reset(invoiceToInput(invoice));
  }, [open, invoice, reset]);

  const submit = handleSubmit(async (v) => {
    const res = await updateInvoiceAction(invoice.id, v);
    if (handleResult(res, setError, "Invoice saved.")) {
      onOpenChange(false);
      router.refresh();
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Terms & discount</DialogTitle>
          <DialogDescription>
            {locked ? "The discount is locked once an invoice is issued." : "Totals are recalculated when you save."}
          </DialogDescription>
        </DialogHeader>
        <form id="invoice-form" onSubmit={submit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Due date" htmlFor="iv-due" error={e.dueDate?.message}>
              <Input id="iv-due" type="date" {...register("dueDate")} />
            </Field>
            <Field label={`Discount (${currency})`} htmlFor="iv-disc" error={e.discount?.message}>
              <Input
                id="iv-disc"
                type="number"
                step="0.01"
                min="0"
                disabled={locked}
                {...register("discount", { setValueAs: asNumber })}
              />
            </Field>
          </div>
          <Field label="Notes" htmlFor="iv-notes" hint="Shown on the printed invoice (bank details, thanks…)">
            <Textarea id="iv-notes" rows={3} {...register("notes")} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="invoice-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({
  invoice,
  open,
  onOpenChange,
  currency,
}: {
  invoice: InvoiceDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currency: string;
}) {
  const router = useRouter();
  const blank: PaymentInput = { amount: invoice.balance, method: "CASH", reference: "", paidAt: "" };
  const form = useForm<PaymentInput>({ resolver: zodResolver(paymentSchema), defaultValues: blank });
  const { register, handleSubmit, reset, setError, setValue, formState } = form;
  const e = formState.errors;

  useEffect(() => {
    if (open) reset({ amount: invoice.balance, method: "CASH", reference: "", paidAt: "" });
  }, [open, invoice.balance, reset]);

  const submit = handleSubmit(async (v) => {
    const res = await recordPaymentAction(invoice.id, v);
    if (handleResult(res, setError, "Payment recorded.")) {
      onOpenChange(false);
      router.refresh();
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            Balance due {formatCurrency(invoice.balance, currency)}. Pay in full or part; the invoice settles itself.
          </DialogDescription>
        </DialogHeader>
        <form id="payment-form" onSubmit={submit} noValidate className="space-y-4">
          <Field label={`Amount (${currency})`} htmlFor="pm-amount" error={e.amount?.message}>
            <div className="flex gap-2">
              <Input
                id="pm-amount"
                type="number"
                step="0.01"
                min="0"
                autoFocus
                {...register("amount", { setValueAs: asNumber })}
              />
              <Button type="button" variant="outline" onClick={() => setValue("amount", invoice.balance)}>
                Full balance
              </Button>
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Method" htmlFor="pm-method" error={e.method?.message}>
              <NativeSelect id="pm-method" {...register("method")}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Date received" htmlFor="pm-date" hint="Blank = today" error={e.paidAt?.message}>
              <Input id="pm-date" type="date" {...register("paidAt")} />
            </Field>
          </div>
          <Field
            label="Reference"
            htmlFor="pm-ref"
            hint="Optional: cheque or transfer number"
            error={e.reference?.message}
          >
            <Input id="pm-ref" {...register("reference")} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="payment-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentsSection({
  invoice,
  currency,
  canWrite,
}: {
  invoice: InvoiceDetail;
  currency: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState<InvoiceDetail["payments"][number] | null>(null);
  const money = (n: number) => formatCurrency(n, currency);
  if (invoice.status === "DRAFT") return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Payments ({invoice.payments.length})</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {invoice.payments.length === 0 ? (
          <p className="text-muted-foreground px-6 pb-3 text-sm">No payments recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Date</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="hidden sm:table-cell">Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {canWrite && invoice.status !== "VOID" && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="pl-6">{formatDay(p.paidAtDay)}</TableCell>
                  <TableCell>{PAYMENT_METHOD_LABEL[p.method]}</TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">{p.reference ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(p.amount)}</TableCell>
                  {canWrite && invoice.status !== "VOID" && (
                    <TableCell className="pr-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="Remove payment"
                        onClick={() => setRemoving(p)}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this payment?"
        description={
          removing
            ? `Use this only to fix a mistake. ${money(removing.amount)} will be taken off the amount paid.`
            : ""
        }
        confirmLabel="Remove payment"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          const res = await deletePaymentAction(invoice.id, removing.id);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success("Payment removed.");
          router.refresh();
        }}
      />
    </Card>
  );
}
