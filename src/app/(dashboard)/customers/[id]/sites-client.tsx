"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, Loader2, MapPin, MapPinOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AddressFields } from "@/components/forms/address-fields";
import { handleResult } from "@/components/forms/apply-server-errors";
import { PinsMap, type LatLng } from "@/components/maps";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteAddressAction, saveAddressAction } from "@/modules/customers/customers.actions";
import {
  addressSchema,
  addressToInput,
  BLANK_ADDRESS,
  mapsUrl,
  type AddressDto,
  type AddressInput,
} from "@/modules/customers/customers.schema";

/** The customer's sites: a map of pinned ones and a card per site with edit / delete. */
export function SitesSection({ customerId, addresses }: { customerId: string; addresses: AddressDto[] }) {
  const [editing, setEditing] = useState<AddressDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<AddressDto | null>(null);
  const pins = addresses
    .filter((a) => a.latitude != null && a.longitude != null)
    .map((a) => ({ id: a.id, lat: a.latitude!, lng: a.longitude!, label: a.label ?? a.addressLine }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Service addresses ({addresses.length})</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
          <Plus /> Add address
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {pins.length > 0 && (
          <div className="isolate h-64 overflow-hidden rounded-md border">
            <PinsMap pins={pins} />
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {addresses.map((a) => {
            const pinned = a.latitude != null && a.longitude != null;
            return (
              <div key={a.id} className="flex items-start gap-3 rounded-lg border p-3">
                {pinned ? (
                  <MapPin className="mt-0.5 size-4 shrink-0 text-blue-600" aria-label="Pinned" />
                ) : (
                  <MapPinOff className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-label="Not pinned" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.label ?? "Site"}</p>
                  <p className="text-muted-foreground text-sm">{a.fullAddress}</p>
                  <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                    {pinned ? `${a.latitude!.toFixed(5)}, ${a.longitude!.toFixed(5)}` : "No map pin"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" className="size-8" asChild>
                    <a href={mapsUrl(a)} target="_blank" rel="noreferrer" aria-label="Open in Google Maps">
                      <ExternalLink />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Edit address"
                    onClick={() => setEditing(a)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Delete address"
                    onClick={() => setDeleting(a)}
                    disabled={addresses.length <= 1}
                    title={addresses.length <= 1 ? "A customer needs at least one address" : undefined}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      <AddressDialog
        customerId={customerId}
        address={editing === "new" ? undefined : (editing ?? undefined)}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        fallbackCenter={pins[0] ?? null}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this address?"
        description="Assets at this site stay with the customer, without a site. Past jobs keep the address."
        confirmLabel="Delete address"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          const res = await deleteAddressAction(customerId, deleting.id);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success("Address deleted.");
        }}
      />
    </Card>
  );
}

function AddressDialog({
  customerId,
  address,
  open,
  onOpenChange,
  fallbackCenter,
}: {
  customerId: string;
  address?: AddressDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fallbackCenter: LatLng | null;
}) {
  const form = useForm<AddressInput>({ resolver: zodResolver(addressSchema), defaultValues: BLANK_ADDRESS });
  const { handleSubmit, reset, setError, formState } = form;

  useEffect(() => {
    if (open) reset(address ? addressToInput(address) : BLANK_ADDRESS);
  }, [open, address, reset]);

  const onSubmit = handleSubmit(async (v) => {
    const res = await saveAddressAction(customerId, address?.id ?? null, v);
    if (handleResult(res, setError, address ? "Address saved." : "Address added.")) onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{address ? "Edit address" : "Add address"}</DialogTitle>
          <DialogDescription>Pin it on the map so it shows on the dispatch board and in Google Maps.</DialogDescription>
        </DialogHeader>
        <form id="address-form" onSubmit={onSubmit} noValidate>
          <AddressFields form={form} name="" idPrefix="addr" fallbackCenter={fallbackCenter} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="address-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            {address ? "Save address" : "Add address"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
