import type { Metadata } from "next";
import Link from "next/link";
import { NewWorkOrderButton } from "./work-order-sheet";
import { Pagination } from "@/components/data-table/pagination";
import { SearchInput } from "@/components/data-table/search-input";
import { UrlSelect } from "@/components/data-table/url-select";
import { PriorityText, WorkOrderStatusBadge } from "@/components/domain/badges";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dbFor, requirePagePermission, requireRole, requireUser } from "@/lib/auth";
import { PRIORITY_LABEL, WORK_ORDER_STATUS_LABEL } from "@/lib/statuses";
import { formatIn } from "@/lib/tz";
import { cn } from "@/lib/utils";
import { checklistsService } from "@/modules/checklists";
import { companiesService } from "@/modules/companies";
import { customersService } from "@/modules/customers";
import { PRIORITIES, WORK_ORDER_STATUSES, workOrderListQuerySchema, workOrdersService } from "@/modules/work-orders";

export const metadata: Metadata = { title: "Work orders" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function WorkOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireUser();
  requireRole(user, ["ADMIN", "DISPATCHER"]);
  requirePagePermission(user, "/work-orders");
  const db = dbFor(user);
  const q = workOrderListQuerySchema.parse(sp);
  const [result, company, customers, templates] = await Promise.all([
    workOrdersService.list(db, q),
    companiesService.getSettings(db, user),
    customersService.options(db),
    checklistsService.options(db),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Work orders</h1>
          <p className="text-muted-foreground text-sm">Every job from intake to completion.</p>
        </div>
        <NewWorkOrderButton customers={customers} templates={templates} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput placeholder="Search number, title, customer, asset, Zoho ticket, PO" />
        <UrlSelect
          param="status"
          label="Status"
          allLabel="All statuses"
          options={[
            { value: "open", label: "Open (not closed)" },
            { value: "overdue", label: "Overdue" },
            ...WORK_ORDER_STATUSES.map((s) => ({ value: s, label: WORK_ORDER_STATUS_LABEL[s] })),
          ]}
        />
        <UrlSelect
          param="priority"
          label="Priority"
          allLabel="Any priority"
          options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
        />
        <UrlSelect
          param="sortBy"
          label="Sort"
          allLabel="Newest first"
          options={[
            { value: "dueDate", label: "By due date" },
            { value: "number", label: "By number" },
          ]}
        />
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Number</TableHead>
              <TableHead>Job</TableHead>
              <TableHead className="hidden md:table-cell">Customer</TableHead>
              <TableHead className="hidden lg:table-cell">Due</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-10 text-center">
                  No work orders match these filters.
                </TableCell>
              </TableRow>
            )}
            {result.items.map((w) => (
              <TableRow key={w.id} className="relative">
                <TableCell className="font-mono text-xs">{w.number}</TableCell>
                <TableCell className="max-w-96">
                  <Link
                    href={`/work-orders/${w.id}`}
                    className="font-medium after:absolute after:inset-0 hover:underline"
                  >
                    {w.title}
                  </Link>
                  <p className="text-xs">
                    <PriorityText priority={w.priority} />
                    {w.assetName && <span className="text-muted-foreground"> · {w.assetName}</span>}
                    {w.zohoTicket && <span className="text-muted-foreground"> · Zoho {w.zohoTicket}</span>}
                  </p>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <p className="text-sm">{w.customerName}</p>
                  {w.siteLabel && <p className="text-muted-foreground max-w-56 truncate text-xs">{w.siteLabel}</p>}
                </TableCell>
                <TableCell
                  className={cn(
                    "hidden text-sm whitespace-nowrap lg:table-cell",
                    w.overdue ? "font-medium text-red-600" : "text-muted-foreground",
                  )}
                >
                  {w.dueDate ? formatIn(new Date(w.dueDate), company.timeZone, "dd MMM, HH:mm") : "—"}
                  {w.overdue && <span className="block text-xs">Overdue</span>}
                </TableCell>
                <TableCell>
                  <WorkOrderStatusBadge status={w.status} />
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
        basePath="/work-orders"
        searchParams={sp}
      />
    </div>
  );
}
