import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AssetHeaderActions } from "../assets-client";
import { AssetStatusBadge, WarrantyBadge } from "@/components/domain/badges";
import { WorkHistoryTable } from "@/components/domain/work-history-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dbFor, requireRole, requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDay } from "@/lib/format";
import { formatIn } from "@/lib/tz";
import { assetsService } from "@/modules/assets";
import { companiesService } from "@/modules/companies";
import { customersService, type CustomerOption } from "@/modules/customers";

export const metadata: Metadata = { title: "Asset" };

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  requireRole(user, ["ADMIN", "DISPATCHER"]);
  const db = dbFor(user);
  const { timeZone } = await companiesService.getSettings(db, user);

  const asset = await assetsService.get(db, id, timeZone).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [history, customer] = await Promise.all([
    assetsService.history(db, id),
    customersService.get(db, asset.customerId),
  ]);
  // The edit sheet may move the asset to another of this customer's sites (not to another customer's).
  const options: CustomerOption[] = [
    {
      id: customer.id,
      name: customer.name,
      addresses: customer.addresses.map((a) => ({
        id: a.id,
        label: a.label ? `${a.label} — ${a.addressLine}` : a.addressLine,
      })),
    },
  ];

  const facts: [string, React.ReactNode][] = [
    [
      "Customer",
      <Link key="c" href={`/customers/${asset.customerId}`} className="hover:underline">
        {asset.customerName}
      </Link>,
    ],
    ["Site", asset.siteLabel ?? "—"],
    ["Category", asset.category ?? "—"],
    ["Brand / model", [asset.brand, asset.model].filter(Boolean).join(" ") || "—"],
    ["Serial number", asset.serialNo ? <span className="font-mono">{asset.serialNo}</span> : "—"],
    ["Installed", formatDay(asset.installDate)],
    ["Warranty ends", formatDay(asset.warrantyEndDate)],
    ["Last service", asset.lastServiceAt ? formatIn(new Date(asset.lastServiceAt), timeZone, "dd MMM yyyy") : "—"],
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href="/assets" className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline">
        <ChevronLeft className="size-4" /> Assets
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">{asset.name}</h1>
          <div className="flex flex-wrap gap-2">
            <AssetStatusBadge status={asset.status} />
            <WarrantyBadge state={asset.warranty} />
          </div>
        </div>
        <AssetHeaderActions asset={asset} customers={options} canDelete={user.role === "ADMIN"} />
      </div>

      <Card>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted-foreground text-xs">{k}</dt>
                <dd className="text-sm font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Service history ({history.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          <WorkHistoryTable
            items={history}
            timeZone={timeZone}
            showAsset={false}
            empty="This asset has not been serviced yet."
          />
        </CardContent>
      </Card>
    </div>
  );
}
