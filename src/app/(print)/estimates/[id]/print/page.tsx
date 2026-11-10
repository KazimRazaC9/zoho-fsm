import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintSheet } from "@/components/domain/print-sheet";
import { dbFor, requireRole, requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDay } from "@/lib/format";
import { companiesService } from "@/modules/companies";
import { ESTIMATE_STATUS_LABEL, estimatesService } from "@/modules/estimates";

export const metadata: Metadata = { title: "Estimate" };

export default async function EstimatePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  requireRole(user, ["ADMIN", "DISPATCHER"]);
  const db = dbFor(user);
  const e = await estimatesService.get(db, user, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const company = await companiesService.getSettings(db, user);

  return (
    <PrintSheet
      kind="Estimate"
      number={e.number}
      status={ESTIMATE_STATUS_LABEL[e.status]}
      company={company}
      billTo={{ name: e.customerName, lines: [e.siteLabel] }}
      meta={[
        ["Date", formatDay(e.createdAt.slice(0, 10))],
        ["Valid until", formatDay(e.validUntil)],
      ]}
      lines={e.lines}
      totals={{ subTotal: e.subTotal, tax: e.tax, total: e.total }}
      currency={company.currency}
      notes={e.notes}
      footer="This estimate is not an invoice. Prices are valid until the date shown."
    />
  );
}
