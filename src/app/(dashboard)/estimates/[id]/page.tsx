import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink, FileText, Inbox, MapPin } from "lucide-react";
import { EstimateActions, EstimateLines } from "./estimate-client";
import { EstimateStatusBadge } from "@/components/domain/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dbFor, requireRole, requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDay } from "@/lib/format";
import { catalogService } from "@/modules/catalog";
import { checklistsService } from "@/modules/checklists";
import { companiesService } from "@/modules/companies";
import { customersService } from "@/modules/customers";
import { estimatesService } from "@/modules/estimates";
import { requestsService } from "@/modules/requests";

export const metadata: Metadata = { title: "Estimate" };

export default async function EstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  requireRole(user, ["ADMIN", "DISPATCHER"]);
  const db = dbFor(user);

  const estimate = await estimatesService.get(db, user, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [company, customers, templates, items, openRequests] = await Promise.all([
    companiesService.getSettings(db, user),
    customersService.options(db),
    checklistsService.options(db),
    catalogService.options(db),
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
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href="/estimates" className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline">
        <ChevronLeft className="size-4" /> Estimates
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-muted-foreground font-mono text-sm">{estimate.number}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{estimate.customerName}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <EstimateStatusBadge status={estimate.status} />
            {estimate.validUntil && (
              <span className={estimate.expired ? "text-sm text-red-600" : "text-muted-foreground text-sm"}>
                Valid until {formatDay(estimate.validUntil)}
                {estimate.expired && " · expired"}
              </span>
            )}
          </div>
        </div>
        <EstimateActions estimate={estimate} customers={customers} requests={requests} templates={templates} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Link href={`/customers/${estimate.customerId}`} className="font-medium hover:underline">
              {estimate.customerName}
            </Link>
            {estimate.siteLabel && (
              <p className="text-muted-foreground flex items-start gap-1.5">
                <MapPin className="mt-0.5 size-4 shrink-0" /> {estimate.siteLabel}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Linked to</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {estimate.requestNumber ? (
              <p className="flex items-center gap-1.5">
                <Inbox className="text-muted-foreground size-4" /> Service request {estimate.requestNumber}
              </p>
            ) : (
              <p className="text-muted-foreground">No service request.</p>
            )}
            {estimate.workOrder ? (
              <Link
                href={`/work-orders/${estimate.workOrder.id}`}
                className="flex items-center gap-1.5 hover:underline"
              >
                <ExternalLink className="text-muted-foreground size-4" /> Work order {estimate.workOrder.number}
              </Link>
            ) : (
              <p className="text-muted-foreground flex items-center gap-1.5">
                <FileText className="size-4" />{" "}
                {estimate.status === "APPROVED" ? "Approved. Create the work order." : "No work order yet."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <EstimateLines estimate={estimate} items={items} currency={company.currency} />

      {estimate.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{estimate.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
