import type { Metadata } from "next";
import Link from "next/link";
import { NewAssetButton } from "./assets-client";
import { Pagination } from "@/components/data-table/pagination";
import { SearchInput } from "@/components/data-table/search-input";
import { UrlSelect } from "@/components/data-table/url-select";
import { AssetStatusBadge, WarrantyBadge } from "@/components/domain/badges";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dbFor, requirePagePermission, requireRole, requireUser } from "@/lib/auth";
import { formatDay } from "@/lib/format";
import { formatIn } from "@/lib/tz";
import {
  ASSET_STATUS_LABEL,
  ASSET_STATUSES,
  assetListQuerySchema,
  assetsService,
  WARRANTY_LABEL,
  WARRANTY_STATES,
} from "@/modules/assets";
import { companiesService } from "@/modules/companies";
import { customersService } from "@/modules/customers";

export const metadata: Metadata = { title: "Assets" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AssetsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireUser();
  requireRole(user, ["ADMIN", "DISPATCHER"]);
  requirePagePermission(user, "/assets");
  const db = dbFor(user);
  const q = assetListQuerySchema.parse(sp);
  const { timeZone } = await companiesService.getSettings(db, user);
  const [result, customers] = await Promise.all([assetsService.list(db, q, timeZone), customersService.options(db)]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
          <p className="text-muted-foreground text-sm">Customer equipment, warranty cover and service history.</p>
        </div>
        <NewAssetButton customers={customers} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput placeholder="Search name, serial, brand, customer" />
        <UrlSelect
          param="status"
          label="Status"
          allLabel="Any status"
          options={ASSET_STATUSES.map((s) => ({ value: s, label: ASSET_STATUS_LABEL[s] }))}
        />
        <UrlSelect
          param="warranty"
          label="Warranty"
          allLabel="Any warranty"
          options={WARRANTY_STATES.map((s) => ({ value: s, label: WARRANTY_LABEL[s] }))}
        />
        <UrlSelect
          param="sortBy"
          label="Sort"
          allLabel="Sort: name"
          options={[
            { value: "warrantyEndDate", label: "Sort: warranty end" },
            { value: "createdAt", label: "Sort: oldest first" },
          ]}
        />
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden lg:table-cell">Serial no.</TableHead>
              <TableHead className="hidden md:table-cell">Warranty</TableHead>
              <TableHead className="hidden xl:table-cell">Last service</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-10 text-center">
                  No assets match these filters.
                </TableCell>
              </TableRow>
            )}
            {result.items.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <Link href={`/assets/${a.id}`} className="font-medium hover:underline">
                    {a.name}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    {[a.category, a.brand, a.model].filter(Boolean).join(" · ") || "—"}
                  </p>
                </TableCell>
                <TableCell>
                  <Link href={`/customers/${a.customerId}`} className="text-sm hover:underline">
                    {a.customerName}
                  </Link>
                  {a.siteLabel && <p className="text-muted-foreground max-w-56 truncate text-xs">{a.siteLabel}</p>}
                </TableCell>
                <TableCell className="hidden font-mono text-xs lg:table-cell">{a.serialNo ?? "—"}</TableCell>
                <TableCell className="hidden md:table-cell">
                  <WarrantyBadge state={a.warranty} />
                  {a.warrantyEndDate && (
                    <p className="text-muted-foreground mt-1 text-xs">{formatDay(a.warrantyEndDate)}</p>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-sm xl:table-cell">
                  {a.lastServiceAt ? formatIn(new Date(a.lastServiceAt), timeZone, "dd MMM yyyy") : "—"}
                </TableCell>
                <TableCell>
                  <AssetStatusBadge status={a.status} />
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
        basePath="/assets"
        searchParams={sp}
      />
    </div>
  );
}
