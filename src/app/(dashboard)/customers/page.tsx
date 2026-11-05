import type { Metadata } from "next";
import Link from "next/link";
import { NewCustomerButton } from "./customers-client";
import { Pagination } from "@/components/data-table/pagination";
import { SearchInput } from "@/components/data-table/search-input";
import { UrlSelect } from "@/components/data-table/url-select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dbFor, requireRole, requireUser } from "@/lib/auth";
import { CUSTOMER_TYPE_LABEL, CUSTOMER_TYPES, customerListQuerySchema, customersService } from "@/modules/customers";

export const metadata: Metadata = { title: "Customers" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireUser();
  requireRole(user, ["ADMIN", "DISPATCHER"]);
  const q = customerListQuerySchema.parse(sp);
  const result = await customersService.list(dbFor(user), q);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-muted-foreground text-sm">
            People and businesses you serve, with their sites and equipment.
          </p>
        </div>
        <NewCustomerButton />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput placeholder="Search name, phone, email, address" />
        <UrlSelect
          param="type"
          label="Type"
          allLabel="All types"
          options={CUSTOMER_TYPES.map((t) => ({ value: t, label: CUSTOMER_TYPE_LABEL[t] }))}
        />
        <UrlSelect
          param="sortBy"
          label="Sort"
          allLabel="Sort: name"
          options={[{ value: "createdAt", label: "Sort: newest" }]}
        />
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden md:table-cell">Contact</TableHead>
              <TableHead className="hidden lg:table-cell">Primary address</TableHead>
              <TableHead className="text-right">Sites</TableHead>
              <TableHead className="text-right">Assets</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Open jobs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-10 text-center">
                  {q.search || q.type ? "No customers match these filters." : "No customers yet. Add your first one."}
                </TableCell>
              </TableRow>
            )}
            {result.items.map((c) => (
              <TableRow key={c.id} className="relative">
                <TableCell>
                  <Link
                    href={`/customers/${c.id}`}
                    className="font-medium after:absolute after:inset-0 hover:underline"
                  >
                    {c.name}
                  </Link>
                  <div className="mt-0.5">
                    <Badge variant="secondary" className="text-[11px]">
                      {CUSTOMER_TYPE_LABEL[c.type]}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
                  <div>{c.phone ?? "—"}</div>
                  <div className="truncate">{c.email}</div>
                </TableCell>
                <TableCell className="text-muted-foreground hidden max-w-xs truncate text-sm lg:table-cell">
                  {c.primaryAddress ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.addressCount}</TableCell>
                <TableCell className="text-right tabular-nums">{c.assetCount}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {c.openWorkOrders > 0 ? <Badge variant="outline">{c.openWorkOrders}</Badge> : "—"}
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
        basePath="/customers"
        searchParams={sp}
      />
    </div>
  );
}
