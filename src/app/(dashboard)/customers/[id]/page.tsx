import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomerHeaderActions } from "../customers-client";
import { MoveAssetButton } from "./move-asset";
import { SitesSection } from "./sites-client";
import { NewAssetButton } from "../../assets/assets-client";
import { AssetStatusBadge, WarrantyBadge } from "@/components/domain/badges";
import { WorkHistoryTable } from "@/components/domain/work-history-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dbFor, requirePagePermission, requireRole, requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDay } from "@/lib/format";
import { assetListQuerySchema, assetsService } from "@/modules/assets";
import { companiesService } from "@/modules/companies";
import { CUSTOMER_TYPE_LABEL, customersService, siteLabelOf, type CustomerOption } from "@/modules/customers";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ project?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  requireRole(user, ["ADMIN", "DISPATCHER"]);
  requirePagePermission(user, "/customers");
  const db = dbFor(user);

  const customer = await customersService.get(db, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { timeZone } = await companiesService.getSettings(db, user);

  const allAssets = await assetsService.list(
    db,
    assetListQuerySchema.parse({ customerId: id, pageSize: 200 }),
    timeZone,
  );

  // A customer with MORE THAN ONE project gets a tab per project (plus "No project" for loose sites and
  // site-less assets). The sites, assets and work history below are those of the open tab. With one project,
  // or none, the page shows everything together.
  const loose = customer.addresses.filter((a) => !a.projectId);
  const siteless = allAssets.items.filter((a) => !a.addressId);
  const tabs =
    customer.projects.length > 1
      ? [
          ...customer.projects.map((p) => ({ key: p.id, name: p.name, sites: p.siteCount })),
          ...(loose.length > 0 || siteless.length > 0
            ? [{ key: "none", name: "No project", sites: loose.length }]
            : []),
        ]
      : [];
  const focus = tabs.length === 0 ? null : (tabs.find((t) => t.key === sp.project) ?? tabs[0]).key;
  const focusSites =
    focus === null
      ? customer.addresses
      : customer.addresses.filter((a) => (focus === "none" ? !a.projectId : a.projectId === focus));
  const siteIds = new Set(focusSites.map((a) => a.id));

  const history = await customersService.history(db, id, focus === null ? undefined : [...siteIds]);
  // Assets sit at a site, so a project's assets are those at its sites (assets without a site go under "No project").
  const assets =
    focus === null
      ? allAssets
      : {
          ...allAssets,
          items: allAssets.items.filter((a) => (a.addressId ? siteIds.has(a.addressId) : focus === "none")),
        };
  const assetCount = focus === null ? allAssets.totalCount : assets.items.length;
  // Every site of the customer, so an asset can be moved to a site of another project.
  const allSites = customer.addresses.map((a) => ({ id: a.id, label: siteLabelOf(a) }));
  const option: CustomerOption = {
    id: customer.id,
    name: customer.name,
    addresses: focusSites.map((a) => ({
      id: a.id,
      label: siteLabelOf(a),
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

      {tabs.length > 0 && (
        <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Projects">
          {tabs.map((t) => {
            const active = t.key === focus;
            return (
              <Link
                key={t.key}
                href={`/customers/${customer.id}?project=${t.key}`}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap",
                  active
                    ? "border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {t.name}
                <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                  {t.sites} site{t.sites === 1 ? "" : "s"}
                </span>
              </Link>
            );
          })}
        </nav>
      )}

      <SitesSection
        customerId={customer.id}
        projects={customer.projects}
        addresses={customer.addresses}
        focus={focus}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Assets ({assetCount})</CardTitle>
          <NewAssetButton customers={[option]} fixedCustomerId={customer.id} size="sm" />
        </CardHeader>
        <CardContent className="px-0">
          {assets.items.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {focus === null
                ? "No equipment recorded for this customer."
                : "No equipment at this project's sites yet."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Asset</TableHead>
                  <TableHead className="hidden md:table-cell">Site</TableHead>
                  <TableHead className="hidden sm:table-cell">Warranty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
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
                    <TableCell className="pr-4">
                      {allSites.length > 0 && (
                        <MoveAssetButton
                          assetId={a.id}
                          assetName={a.name}
                          currentSiteId={a.addressId}
                          sites={allSites}
                        />
                      )}
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
          <CardTitle className="text-base">Work history{focus !== null && " for this project"}</CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          <WorkHistoryTable items={history} timeZone={timeZone} />
        </CardContent>
      </Card>
    </div>
  );
}
