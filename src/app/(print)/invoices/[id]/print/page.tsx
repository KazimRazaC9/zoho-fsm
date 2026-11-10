import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintSheet } from "@/components/domain/print-sheet";
import { dbFor, requireRole, requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDay } from "@/lib/format";
import { companiesService } from "@/modules/companies";
import { INVOICE_STATUS_LABEL, invoicesService, PAYMENT_METHOD_LABEL } from "@/modules/invoices";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  requireRole(user, ["ADMIN", "DISPATCHER"]);
  const db = dbFor(user);
  const i = await invoicesService.get(db, user, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const company = await companiesService.getSettings(db, user);

  return (
    <PrintSheet
      kind="Invoice"
      number={i.number}
      status={INVOICE_STATUS_LABEL[i.status]}
      company={company}
      billTo={{ name: i.customer.name, lines: [i.customer.email, i.customer.phone] }}
      meta={[
        ["Issued", formatDay(i.issueDate)],
        ["Due", formatDay(i.dueDate)],
        ...(i.workOrder ? ([["Work order", i.workOrder.number]] as [string, string][]) : []),
      ]}
      lines={i.lines}
      totals={{
        subTotal: i.subTotal,
        tax: i.tax,
        discount: i.discount,
        total: i.total,
        paid: i.amountPaid,
        balance: i.status === "VOID" ? undefined : i.balance,
      }}
      currency={company.currency}
      notes={i.notes}
      payments={i.payments.map((p) => ({
        day: p.paidAtDay,
        method: PAYMENT_METHOD_LABEL[p.method],
        reference: p.reference,
        amount: p.amount,
      }))}
      footer="Thank you for your business."
    />
  );
}
