import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, ChevronLeft, ExternalLink, Inbox, MapPin, Phone, Wrench } from "lucide-react";
import { AttachmentsSection, ChecklistSection, LinesSection, NotesSection, StatusActions } from "./work-order-client";
import { EvidencePanel } from "./evidence-panel";
import { InvoiceLink } from "./invoice-link";
import { PriorityText, WorkOrderStatusBadge } from "@/components/domain/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dbFor, requirePagePermission, requireRole, requireUser } from "@/lib/auth";
import { canQa } from "@/lib/permissions";
import { NotFoundError } from "@/lib/errors";
import { WORK_ORDER_STATUS_LABEL } from "@/lib/statuses";
import { formatIn } from "@/lib/tz";
import { cn } from "@/lib/utils";
import { catalogService } from "@/modules/catalog";
import { checklistsService } from "@/modules/checklists";
import { companiesService } from "@/modules/companies";
import { customersService, mapsUrl } from "@/modules/customers";
import { invoicesService } from "@/modules/invoices";
import { schedulingService } from "@/modules/scheduling";
import { workOrdersService } from "@/modules/work-orders";

export const metadata: Metadata = { title: "Work order" };

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  requireRole(user, ["ADMIN", "DISPATCHER"]);
  requirePagePermission(user, "/work-orders");
  const db = dbFor(user);

  const wo = await workOrdersService.get(db, user, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [company, customers, templates, items, visit, invoice] = await Promise.all([
    companiesService.getSettings(db, user),
    customersService.options(db),
    checklistsService.options(db),
    catalogService.options(db),
    schedulingService.forWorkOrder(db, user, id),
    invoicesService.forWorkOrder(db, id),
  ]);
  const tz = company.timeZone;
  const when = (iso: string, p = "dd MMM yyyy, HH:mm") => formatIn(new Date(iso), tz, p);
  const ctx = { wo, currency: company.currency, role: user.role, userId: user.id };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link
        href="/work-orders"
        className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
      >
        <ChevronLeft className="size-4" /> Work orders
      </Link>

      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-muted-foreground font-mono text-sm">{wo.number}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{wo.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <WorkOrderStatusBadge status={wo.status} />
              <PriorityText priority={wo.priority} />
              {visit && (
                <Link
                  href={`/dispatch?date=${visit.startLocal.slice(0, 10)}`}
                  className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
                >
                  <CalendarClock className="size-4" />
                  {visit.technicianName} · {when(visit.start)} ({visit.durationMin} min)
                </Link>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <InvoiceLink
              workOrderId={wo.id}
              completed={wo.status === "CLOSED"}
              awaitingQa={wo.status === "COMPLETED"}
              isAdmin={user.role === "ADMIN"}
              invoice={invoice}
            />
            <StatusActions wo={wo} role={user.role} canQa={canQa(user)} customers={customers} />
          </div>
        </div>

        <Card>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Customer">
              <Link href={`/customers/${wo.customerId}`} className="font-medium hover:underline">
                {wo.customerName}
              </Link>
              {wo.customerPhone && (
                <a
                  href={`tel:${wo.customerPhone}`}
                  className="text-muted-foreground flex items-center gap-1 text-xs hover:underline"
                >
                  <Phone className="size-3" /> {wo.customerPhone}
                </a>
              )}
            </Fact>
            <Fact label="Site" icon={<MapPin className="size-3.5" />}>
              {wo.address ? (
                <>
                  <span>{wo.address.label ?? "Site"}</span>
                  <a
                    href={mapsUrl(wo.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground flex items-start gap-1 text-xs hover:underline"
                  >
                    {wo.address.fullAddress} <ExternalLink className="mt-0.5 size-3 shrink-0" />
                  </a>
                </>
              ) : (
                "—"
              )}
            </Fact>
            <Fact label="Asset" icon={<Wrench className="size-3.5" />}>
              {wo.assetId ? (
                <Link href={`/assets/${wo.assetId}`} className="hover:underline">
                  {wo.assetName}
                </Link>
              ) : (
                "—"
              )}
            </Fact>
            <Fact label="Due" icon={<CalendarClock className="size-3.5" />}>
              <span className={cn(wo.overdue && "font-medium text-red-600")}>
                {wo.dueDate ? when(wo.dueDate) : "—"}
                {wo.overdue && " · overdue"}
              </span>
              {wo.completedAt && (
                <span className="text-muted-foreground text-xs">Completed {when(wo.completedAt)}</span>
              )}
            </Fact>
            {(wo.zohoTicket || wo.purchaseOrder) && (
              <Fact label="References">
                {wo.zohoTicket && <span>Zoho ticket: {wo.zohoTicket}</span>}
                {wo.purchaseOrder && <span>PO: {wo.purchaseOrder}</span>}
              </Fact>
            )}
            {(wo.description || wo.request) && (
              <div className="space-y-2 sm:col-span-2 lg:col-span-4">
                {wo.request && (
                  <p className="text-muted-foreground flex items-center gap-1 text-xs">
                    <Inbox className="size-3.5" /> From service request{" "}
                    <Link
                      href={`/requests?status=all&search=${wo.request.number}`}
                      className="font-mono hover:underline"
                    >
                      {wo.request.number}
                    </Link>
                  </p>
                )}
                {wo.description && <p className="whitespace-pre-line">{wo.description}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <LinesSection {...ctx} items={items} />
          <ChecklistSection {...ctx} templates={templates} />
          <EvidencePanel wo={wo} userId={user.id} />
          <AttachmentsSection {...ctx} />
        </div>
        <div className="space-y-4">
          <NotesSection {...ctx} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l pl-5">
                {[...wo.timeline].reverse().map((t) => (
                  <li key={t.id} className="relative">
                    <span className="bg-primary ring-background absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4" />
                    <p className="text-sm">
                      {t.fromStatus ? (
                        <>
                          {WORK_ORDER_STATUS_LABEL[t.fromStatus]} →{" "}
                          <span className="font-medium">{WORK_ORDER_STATUS_LABEL[t.toStatus]}</span>
                        </>
                      ) : (
                        <span className="font-medium">Created as {WORK_ORDER_STATUS_LABEL[t.toStatus]}</span>
                      )}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {when(t.at)}
                      {t.by && ` · ${t.by}`}
                    </p>
                    {t.reason && <p className="bg-muted mt-1 rounded px-2 py-1 text-xs">{t.reason}</p>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-muted-foreground flex items-center gap-1 text-xs">
        {icon}
        {label}
      </p>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}
