"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AssetSheet } from "./asset-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteAssetAction } from "@/modules/assets/assets.actions";
import type { AssetDto } from "@/modules/assets/assets.schema";
import type { CustomerOption } from "@/modules/customers/customers.schema";

export function NewAssetButton({
  customers,
  fixedCustomerId,
  size,
}: {
  customers: CustomerOption[];
  fixedCustomerId?: string;
  size?: "sm";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={size ? "outline" : "default"} onClick={() => setOpen(true)}>
        <Plus /> {size ? "Add asset" : "New asset"}
      </Button>
      <AssetSheet open={open} onOpenChange={setOpen} customers={customers} fixedCustomerId={fixedCustomerId} />
    </>
  );
}

export function AssetHeaderActions({
  asset,
  customers,
  canDelete,
}: {
  asset: AssetDto;
  customers: CustomerOption[];
  canDelete: boolean;
}) {
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
      <AssetSheet open={dialog === "edit"} onOpenChange={close} customers={customers} asset={asset} />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={close}
        title={`Delete ${asset.name}?`}
        description="The asset is removed from lists. Past work orders keep their history. To keep it on record, set its status to Retired instead."
        confirmLabel="Delete asset"
        destructive
        onConfirm={async () => {
          const res = await deleteAssetAction(asset.id);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success(`${asset.name} was deleted.`);
          router.push(`/customers/${asset.customerId}`);
        }}
      />
    </div>
  );
}
