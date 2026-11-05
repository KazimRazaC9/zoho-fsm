import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Mail, Phone } from "lucide-react";
import { CustomerHeaderActions } from "../customers-client";
import { SitesSection } from "./sites-client";
import { NewAssetButton } from "../../assets/assets-client";
import { AssetStatusBadge, WarrantyBadge } from "@/components/domain/badges";
import { WorkHistoryTable } from "@/components/domain/work-history-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dbFor, requireRole, requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDay } from "@/lib/format";
import { assetListQuerySchema, assetsService } from "@/modules/assets";
import { companiesService } from "@/modules/companies";
import { CUSTOMER_TYPE_LABEL, customersService, type CustomerOption } from "@/modules/customers";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  requireRole(user, ["ADMIN", "DISPATCHER"]);
  const db = dbFor(user);

  const customer = await customersService.get(db, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { timeZone } = await companiesService.getSettings(db, user);
  const [assets, history] = await Promise.all([
    assetsService.list(db, assetListQuerySchema.parse({ customerId: id, pageSize: 200 }), timeZone),
    customersService.history(db, id),
  ]);
  const option: CustomerOption = {
    id: customer.id,
    name: customer.name,
    addresses: customer.addresses.map((a) => ({
      id: a.id,
      label: a.label ? `${a.label} — ${a.addressLine}` : a.addressLine,
    })),
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href="/customers" className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline">
        <ChevronLeft className="size-4" /> Customers
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
            <Badge variant="secondary">{CUSTOMER_TYPE_LABEL[customer.type]}</Badge>
          </div>
          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {customer.phone && (
              <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1 hover:underline">
                <Phone className="size-3.5" /> {customer.phone}
              </a>
            )}
            {customer.email && (
              <a href={`mailto:${customer.email}`} className="inline-flex items-center gap-1 hover:underline">
                <Mail className="size-3.5" /> {customer.email}
              </a>
            )}
          </div>
          {customer.notes && <p className="max-w-2xl text-sm whitespace-pre-line">{customer.notes}</p>}
        </div>
        <CustomerHeaderActions customer={customer} canDelete={user.role === "ADMIN"} />
      </div>

      <SitesSection customerId={customer.id} addresses={customer.addresses} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Assets ({assets.totalCount})</CardTitle>
          <NewAssetButton customers={[option]} fixedCustomerId={customer.id} size="sm" />
        </CardHeader>
        <CardContent className="px-0">
          {assets.items.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">No equipment recorded for this customer.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Asset</TableHead>
                  <TableHead className="hidden md:table-cell">Site</TableHead>
                  <TableHead className="hidden sm:table-cell">Warranty</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.items.map((a) => (
                  <TableRow key={a.id} className="relative">
                    <TableCell className="pl-6">
                      <Link
                        href={`/assets/${a.id}`}
                        className="font-medium after:absolute after:inset-0 hover:underline"
                      >
                        {a.name}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        {[a.brand, a.model, a.serialNo && `S/N ${a.serialNo}`].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
                      {a.siteLabel ?? "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <WarrantyBadge state={a.warranty} />
                      {a.warrantyEndDate && (
                        <p className="text-muted-foreground mt-1 text-xs">{formatDay(a.warrantyEndDate)}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <AssetStatusBadge status={a.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Work history</CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          <WorkHistoryTable items={history} timeZone={timeZone} />
        </CardContent>
      </Card>
    </div>
  );
}
