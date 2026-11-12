import type { Metadata } from "next";
import Link from "next/link";
import { NewEstimateButton } from "./estimates-client";
import { Pagination } from "@/components/data-table/pagination";
import { SearchInput } from "@/components/data-table/search-input";
import { UrlSelect } from "@/components/data-table/url-select";
import { EstimateStatusBadge } from "@/components/domain/badges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dbFor, requirePagePermission, requireRole, requireUser } from "@/lib/auth";
import { formatCurrency, formatDay } from "@/lib/format";
import { companiesService } from "@/modules/companies";
import { customersService } from "@/modules/customers";
import {
  ESTIMATE_STATUS_LABEL,
  ESTIMATE_STATUSES,
  estimateListQuerySchema,
  estimatesService,
} from "@/modules/estimates";
import { requestsService } from "@/modules/requests";

export const metadata: Metadata = { title: "Estimates" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function EstimatesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireUser();
  requireRole(user, ["ADMIN", "DISPATCHER"]);
  requirePagePermission(user, "/estimates");
  const db = dbFor(user);
  const q = estimateListQuerySchema.parse(sp);
  const fromRequest = typeof sp.request === "string" ? sp.request : "";

  const [result, customers, company, openRequests] = await Promise.all([
    estimatesService.list(db, user, q),
    customersService.options(db),
    companiesService.getSettings(db, user),
    requestsService.list(db, user, { page: 1, pageSize: 200, status: "open" }),
  ]);
  const requests = openRequests.items.map((r) => ({
    id: r.id,
    number: r.number,
    title: r.title,
    customerId: r.customerId,
    addressId: r.addressId ?? "",
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estimates</h1>
          <p className="text-muted-foreground text-sm">
            Quotations for customers who want a price first. Approved estimates become work orders.
          </p>
        </div>
        <NewEstimateButton customers={customers} requests={requests} openForRequest={fromRequest} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput placeholder="Search number or customer" />
        <UrlSelect
          param="status"
          label="Status"
          allLabel="All statuses"
          options={ESTIMATE_STATUSES.map((s) => ({ value: s, label: ESTIMATE_STATUS_LABEL[s] }))}
        />
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Estimate</TableHead>
              <TableHead className="hidden sm:table-cell">Customer</TableHead>
              <TableHead className="hidden md:table-cell">Valid until</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-10 text-center">
                  {q.search || q.status !== "all"
                    ? "No estimates match these filters."
                    : "No estimates yet. Create one from a service request that needs a price."}
                </TableCell>
              </TableRow>
            )}
            {result.items.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <Link href={`/estimates/${e.id}`} className="font-mono text-sm font-medium hover:underline">
                    {e.number}
                  </Link>
                  {e.requestNumber && <p className="text-muted-foreground text-xs">for {e.requestNumber}</p>}
                </TableCell>
                <TableCell className="hidden sm:table-cell">{e.customerName}</TableCell>
                <TableCell className="hidden text-sm md:table-cell">
                  {e.validUntil ? (
                    <span className={e.expired ? "text-red-600" : "text-muted-foreground"}>
                      {formatDay(e.validUntil)}
                      {e.expired && " · expired"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(e.total, company.currency)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <EstimateStatusBadge status={e.status} />
                    {e.workOrder && (
                      <Link href={`/work-orders/${e.workOrder.id}`}>
                        <Badge variant="outline">→ {e.workOrder.number}</Badge>
                      </Link>
                    )}
                  </div>
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
        basePath="/estimates"
        searchParams={sp}
      />
    </div>
  );
}
