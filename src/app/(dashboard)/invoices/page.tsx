import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/data-table/pagination";
import { SearchInput } from "@/components/data-table/search-input";
import { UrlSelect } from "@/components/data-table/url-select";
import { InvoiceStatusBadge } from "@/components/domain/badges";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dbFor, requireRole, requireUser } from "@/lib/auth";
import { formatCurrency, formatDay } from "@/lib/format";
import { companiesService } from "@/modules/companies";
import { INVOICE_STATUS_LABEL, INVOICE_STATUSES, invoiceListQuerySchema, invoicesService } from "@/modules/invoices";

export const metadata: Metadata = { title: "Invoices" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireUser();
  requireRole(user, ["ADMIN", "DISPATCHER"]);
  const db = dbFor(user);
  const q = invoiceListQuerySchema.parse(sp);

  const [result, summary, company] = await Promise.all([
    invoicesService.list(db, user, q),
    invoicesService.summary(db, user),
    companiesService.getSettings(db, user),
  ]);
  const money = (n: number) => formatCurrency(n, company.currency);

  const stats = [
    {
      label: "Outstanding",
      value: money(summary.outstanding),
      hint: `${summary.openCount} open invoice${summary.openCount === 1 ? "" : "s"}`,
    },
    { label: "Overdue", value: money(summary.overdue), hint: "Past the due date", alert: summary.overdue > 0 },
    { label: "Collected, last 30 days", value: money(summary.collected30), hint: "Payments received" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="text-muted-foreground text-sm">
          Create an invoice from a completed work order, issue it, then record payments. Partial payments are fine.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="py-0">
            <CardContent className="space-y-0.5 py-4">
              <p className="text-muted-foreground text-xs font-medium">{s.label}</p>
              <p className={`text-2xl font-semibold tabular-nums ${s.alert ? "text-red-600" : ""}`}>{s.value}</p>
              <p className="text-muted-foreground text-xs">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput placeholder="Search number, customer or work order" />
        <UrlSelect
          param="status"
          label="Status"
          allLabel="All statuses"
          options={[
            { value: "open", label: "Open (unpaid)" },
            ...INVOICE_STATUSES.map((s) => ({ value: s, label: INVOICE_STATUS_LABEL[s] })),
          ]}
        />
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead className="hidden sm:table-cell">Customer</TableHead>
              <TableHead className="hidden md:table-cell">Due</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Balance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-10 text-center">
                  {q.search || q.status !== "all"
                    ? "No invoices match these filters."
                    : "No invoices yet. Open a completed work order and press Create invoice."}
                </TableCell>
              </TableRow>
            )}
            {result.items.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <Link href={`/invoices/${i.id}`} className="font-mono text-sm font-medium hover:underline">
                    {i.number}
                  </Link>
                  {i.workOrder && <p className="text-muted-foreground text-xs">{i.workOrder.number}</p>}
                </TableCell>
                <TableCell className="hidden sm:table-cell">{i.customerName}</TableCell>
                <TableCell
                  className={`hidden text-sm md:table-cell ${i.status === "OVERDUE" ? "text-red-600" : "text-muted-foreground"}`}
                >
                  {formatDay(i.dueDate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(i.total)}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {i.status === "VOID" || i.status === "DRAFT" ? "—" : money(i.balance)}
                </TableCell>
                <TableCell>
                  <InvoiceStatusBadge status={i.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Pagination
        page={q.page}
        pageSize={q.pageSize}
        totalCount={result.totalCount}
        basePath="/invoices"
        searchParams={sp}
      />
    </div>
  );
}
