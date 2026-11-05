import type { Metadata } from "next";
import { ItemRowActions, NewItemButton } from "./catalog-client";
import { Pagination } from "@/components/data-table/pagination";
import { SearchInput } from "@/components/data-table/search-input";
import { UrlSelect } from "@/components/data-table/url-select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dbFor, requireRole, requireUser } from "@/lib/auth";
import { formatCurrency, formatQty } from "@/lib/format";
import {
  catalogService,
  ITEM_TYPE_LABEL,
  ITEM_TYPES,
  LOW_STOCK_THRESHOLD,
  serviceItemListQuerySchema,
} from "@/modules/catalog";
import { companiesService } from "@/modules/companies";

export const metadata: Metadata = { title: "Service catalog" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireUser();
  requireRole(user, ["ADMIN"]);
  const db = dbFor(user);
  const q = serviceItemListQuerySchema.parse(sp);
  const [result, company] = await Promise.all([catalogService.list(db, q), companiesService.getSettings(db, user)]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Service catalog</h1>
          <p className="text-muted-foreground text-sm">Services and parts with their price, tax and stock.</p>
        </div>
        <NewItemButton currency={company.currency} defaultTaxPercent={company.taxPercent} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput placeholder="Search name or SKU" />
        <UrlSelect
          param="type"
          label="Type"
          allLabel="Services & parts"
          options={ITEM_TYPES.map((t) => ({ value: t, label: `${ITEM_TYPE_LABEL[t]}s` }))}
        />
        <UrlSelect
          param="status"
          label="Status"
          allLabel="Any status"
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
        <UrlSelect
          param="stock"
          label="Stock"
          allLabel="Any stock"
          options={[{ value: "low", label: `Low stock (≤ ${LOW_STOCK_THRESHOLD})` }]}
        />
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="hidden text-right md:table-cell">Tax</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="hidden lg:table-cell">Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-10 text-center">
                  No items match these filters.
                </TableCell>
              </TableRow>
            )}
            {result.items.map((i) => (
              <TableRow key={i.id} className={i.isActive ? undefined : "opacity-60"}>
                <TableCell>
                  <p className="font-medium">{i.name}</p>
                  {i.sku && <p className="text-muted-foreground font-mono text-xs">{i.sku}</p>}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant={i.type === "SERVICE" ? "secondary" : "outline"}>{ITEM_TYPE_LABEL[i.type]}</Badge>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {formatCurrency(i.unitPrice, company.currency)}
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-right tabular-nums md:table-cell">
                  {formatQty(i.taxPercent)}%
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {i.stockQty == null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={i.lowStock ? "font-medium text-red-600" : undefined}>
                      {formatQty(i.stockQty)}
                      {i.lowStock && <span className="ml-1 text-xs">low</span>}
                    </span>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <Badge variant={i.isActive ? "outline" : "destructive"}>{i.isActive ? "Active" : "Inactive"}</Badge>
                </TableCell>
                <TableCell>
                  <ItemRowActions item={i} currency={company.currency} />
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
        basePath="/catalog"
        searchParams={sp}
      />
    </div>
  );
}
