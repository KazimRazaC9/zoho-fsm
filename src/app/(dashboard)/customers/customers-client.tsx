"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CustomerSheet } from "./customer-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteCustomerAction } from "@/modules/customers/customers.actions";
import type { CustomerDto } from "@/modules/customers/customers.schema";

export function NewCustomerButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> New customer
      </Button>
      <CustomerSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

export function CustomerHeaderActions({ customer, canDelete }: { customer: CustomerDto; canDelete: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const close = (o: boolean) => !o && setDialog(null);

  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={() => setDialog("edit")}>
        <Pencil /> Edit
      </Button>
      {canDelete && (
        <Button variant="outline" onClick={() => setDialog("delete")}>
          <Trash2 /> Delete
        </Button>
      )}
      <CustomerSheet open={dialog === "edit"} onOpenChange={close} customer={customer} />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={close}
        title={`Delete ${customer.name}?`}
        description="The customer, their addresses and their assets are removed from lists. Past work orders and invoices keep their history."
        confirmLabel="Delete customer"
        destructive
        onConfirm={async () => {
          const res = await deleteCustomerAction(customer.id);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success(`${customer.name} was deleted.`);
          router.push("/customers");
        }}
      />
    </div>
  );
}
