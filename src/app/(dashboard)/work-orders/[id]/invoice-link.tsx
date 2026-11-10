"use client";

import { Loader2, Receipt } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { InvoiceStatusBadge } from "@/components/domain/badges";
import { Button } from "@/components/ui/button";
import { createInvoiceAction } from "@/modules/invoices/invoices.actions";

type InvoiceRef = { id: string; number: string; status: import("@prisma/client").InvoiceStatus } | null;

/** On a completed work order: jump to its invoice, or (Admin) create one from the work order's lines. */
export function InvoiceLink({
  workOrderId,
  completed,
  isAdmin,
  invoice,
}: {
  workOrderId: string;
  completed: boolean;
  isAdmin: boolean;
  invoice: InvoiceRef;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (invoice) {
    return (
      <Button variant="outline" asChild>
        <Link href={`/invoices/${invoice.id}`}>
          <Receipt /> {invoice.number} <InvoiceStatusBadge status={invoice.status} />
        </Link>
      </Button>
    );
  }
  if (!completed || !isAdmin) return null;

  return (
    <Button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await createInvoiceAction(workOrderId);
        setBusy(false);
        if (!res.ok) return void toast.error(res.error);
        toast.success(`${res.data.number} created.`);
        router.push(`/invoices/${res.data.id}`);
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Receipt />} Create invoice
    </Button>
  );
}
