import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { InvoiceActions, InvoiceLines, PaymentsSection } from "./invoice-client";
import { InvoiceStatusBadge } from "@/components/domain/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dbFor, requireRole, requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatCurrency, formatDay } from "@/lib/format";
import { catalogService } from "@/modules/catalog";
import { companiesService } from "@/modules/companies";
import { invoicesService } from "@/modules/invoices";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  requireRole(user, ["ADMIN", "DISPATCHER"]);
  const db = dbFor(user);

  const invoice = await invoicesService.get(db, user, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [company, items] = await Promise.all([companiesService.getSettings(db, user), catalogService.options(db)]);
  const canWrite = user.role === "ADMIN";
  const money = (n: number) => formatCurrency(n, company.currency);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href="/invoices" className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline">
        <ChevronLeft className="size-4" /> Invoices
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-muted-foreground font-mono text-sm">{invoice.number}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{invoice.customer.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <InvoiceStatusBadge status={invoice.status} />
            <span className="text-muted-foreground text-sm">
              Issued {formatDay(invoice.issueDate)} · due {formatDay(invoice.dueDate)}
            </span>
          </div>
        </div>
        <InvoiceActions invoice={invoice} canWrite={canWrite} currency={company.currency} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Link href={`/customers/${invoice.customerId}`} className="font-medium hover:underline">
              {invoice.customer.name}
            </Link>
            {invoice.customer.email && <p className="text-muted-foreground">{invoice.customer.email}</p>}
            {invoice.customer.phone && <p className="text-muted-foreground">{invoice.customer.phone}</p>}
            {invoice.workOrder && (
              <Link
                href={`/work-orders/${invoice.workOrder.id}`}
                className="text-muted-foreground inline-flex items-center gap-1 hover:underline"
              >
                <ExternalLink className="size-3.5" /> Work order {invoice.workOrder.number}
              </Link>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Balance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="text-2xl font-semibold tabular-nums">
              {invoice.status === "VOID" ? "—" : money(invoice.balance)}
            </p>
            <p className="text-muted-foreground">
              {money(invoice.amountPaid)} paid of {money(invoice.total)}
            </p>
          </CardContent>
        </Card>
      </div>

      <InvoiceLines invoice={invoice} items={items} currency={company.currency} canWrite={canWrite} />
      <PaymentsSection invoice={invoice} currency={company.currency} canWrite={canWrite} />

      {invoice.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
