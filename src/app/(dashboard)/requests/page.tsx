import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { NewRequestButton, RequestRowActions } from "./requests-client";
import { Pagination } from "@/components/data-table/pagination";
import { SearchInput } from "@/components/data-table/search-input";
import { UrlSelect } from "@/components/data-table/url-select";
import { PriorityText } from "@/components/domain/badges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dbFor, requirePagePermission, requireRole, requireUser } from "@/lib/auth";
import { checklistsService } from "@/modules/checklists";
import { customersService } from "@/modules/customers";
import {
  REQUEST_SOURCES,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUSES,
  requestListQuerySchema,
  requestsService,
  CATEGORY_LABEL,
  SOURCE_LABEL,
  type RequestCategory,
  type RequestSource,
} from "@/modules/requests";

export const metadata: Metadata = { title: "Service requests" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RequestsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireUser();
  requireRole(user, ["ADMIN", "DISPATCHER"]);
  requirePagePermission(user, "/requests");
  const db = dbFor(user);
  const q = requestListQuerySchema.parse(sp);
  const [result, customers, templates] = await Promise.all([
    requestsService.list(db, user, q),
    customersService.options(db),
    checklistsService.options(db),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Service requests</h1>
          <p className="text-muted-foreground text-sm">
            The intake queue: calls, emails and messages waiting to become work orders. Urgent and oldest first.
          </p>
        </div>
        <NewRequestButton customers={customers} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput placeholder="Search number, title, customer" />
        <UrlSelect
          param="status"
          label="Status"
          allLabel="Open (New + Estimated)"
          options={[
            ...REQUEST_STATUSES.map((s) => ({ value: s, label: REQUEST_STATUS_LABEL[s] })),
            { value: "all", label: "All statuses" },
          ]}
        />
        <UrlSelect
          param="source"
          label="Source"
          allLabel="Any source"
          options={REQUEST_SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))}
        />
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Request</TableHead>
              <TableHead className="hidden md:table-cell">Customer</TableHead>
              <TableHead className="hidden sm:table-cell">Source</TableHead>
              <TableHead className="hidden lg:table-cell">Received</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-10 text-center">
                  {q.status === "open" && !q.search ? "The queue is empty. Nice." : "No requests match these filters."}
                </TableCell>
              </TableRow>
            )}
            {result.items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="max-w-80">
                  <p className="text-muted-foreground font-mono text-xs">{r.number}</p>
                  <p className="font-medium">{r.title}</p>
                  <p className="text-xs">
                    <PriorityText priority={r.priority} />
                    {r.category && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {CATEGORY_LABEL[r.category as RequestCategory] ?? r.category}
                      </span>
                    )}
                    {r.assetName && <span className="text-muted-foreground"> · {r.assetName}</span>}
                  </p>
                  {r.zohoTicket && <p className="text-muted-foreground text-xs">Zoho: {r.zohoTicket}</p>}
                  {(r.contactName || r.contactPhone) && (
                    <p className="text-muted-foreground text-xs">
                      {[r.contactName, r.contactPhone].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Link href={`/customers/${r.customerId}`} className="text-sm hover:underline">
                    {r.customerName}
                  </Link>
                  {r.siteLabel && <p className="text-muted-foreground max-w-56 truncate text-xs">{r.siteLabel}</p>}
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
                  {SOURCE_LABEL[r.source as RequestSource] ?? r.source}
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-sm whitespace-nowrap lg:table-cell">
                  {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                </TableCell>
                <TableCell>
                  {r.workOrder ? (
                    <Link href={`/work-orders/${r.workOrder.id}`} className="text-sm hover:underline">
                      <Badge variant="outline">→ {r.workOrder.number}</Badge>
                    </Link>
                  ) : (
                    <Badge variant={r.status === "CANCELLED" ? "secondary" : "outline"}>
                      {REQUEST_STATUS_LABEL[r.status]}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <RequestRowActions request={r} customers={customers} templates={templates} />
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
        basePath="/requests"
        searchParams={sp}
      />
    </div>
  );
}
