"use client";

import { LocateFixed, MapPin, X } from "lucide-react";
import { useState } from "react";
import type { FieldErrors, FieldValues, Path, PathValue, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { PickerMap, type LatLng } from "@/components/maps";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AddressInput } from "@/modules/customers/customers.schema";

const toLatLng = (lat: string, lng: string): LatLng | null =>
  lat && lng && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))
    ? { lat: Number(lat), lng: Number(lng) }
    : null;

/**
 * The fields of one service address, bound to `name` inside any form
 * (e.g. "addresses.0" in the new-customer form, or "" for a form that is just an address).
 */
export function AddressFields<T extends FieldValues>({
  form,
  name,
  idPrefix,
  fallbackCenter,
}: {
  form: UseFormReturn<T>;
  name: string;
  idPrefix: string;
  fallbackCenter?: LatLng | null;
}) {
  const { register, setValue, watch, formState } = form;
  const path = (k: keyof AddressInput) => (name ? `${name}.${k}` : k) as Path<T>;
  const set = (k: keyof AddressInput, v: string) =>
    setValue(path(k), v as PathValue<T, Path<T>>, { shouldValidate: true, shouldDirty: true });

  const errors = (
    name
      ? name.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], formState.errors)
      : formState.errors
  ) as FieldErrors<AddressInput> | undefined;
  const err = (k: keyof AddressInput) => errors?.[k]?.message as string | undefined;

  const lat = watch(path("latitude")) as string;
  const lng = watch(path("longitude")) as string;
  const pin = toLatLng(lat, lng);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LatLng | null>(null);

  const openPicker = () => {
    setDraft(pin);
    setOpen(true);
  };
  const savePin = () => {
    if (draft) {
      set("latitude", draft.lat.toFixed(6));
      set("longitude", draft.lng.toFixed(6));
    }
    setOpen(false);
  };
  const locate = () => {
    if (!navigator.geolocation) return toast.error("This browser cannot share its location.");
    navigator.geolocation.getCurrentPosition(
      (p) => setDraft({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => toast.error("Location permission was denied or unavailable."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const id = (k: string) => `${idPrefix}-${k}`;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Label" htmlFor={id("label")} error={err("label")} className="sm:col-span-1">
          <Input id={id("label")} placeholder="Home, Head office…" {...register(path("label"))} />
        </Field>
        <Field label="Address" htmlFor={id("line")} error={err("addressLine")} className="sm:col-span-2">
          <Input
            id={id("line")}
            placeholder="Street, building, area"
            {...register(path("addressLine"))}
            aria-invalid={!!err("addressLine")}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="City" htmlFor={id("city")} error={err("city")}>
          <Input id={id("city")} {...register(path("city"))} />
        </Field>
        <Field label="State / province" htmlFor={id("state")} error={err("state")}>
          <Input id={id("state")} {...register(path("state"))} />
        </Field>
        <Field label="Postal code" htmlFor={id("postal")} error={err("postalCode")}>
          <Input id={id("postal")} {...register(path("postalCode"))} />
        </Field>
        <Field label="Country" htmlFor={id("country")} error={err("country")}>
          <Input id={id("country")} {...register(path("country"))} />
        </Field>
      </div>
      <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Field label="Latitude" htmlFor={id("lat")} error={err("latitude")}>
          <Input id={id("lat")} inputMode="decimal" placeholder="31.520400" {...register(path("latitude"))} />
        </Field>
        <Field label="Longitude" htmlFor={id("lng")} error={err("longitude")}>
          <Input id={id("lng")} inputMode="decimal" placeholder="74.358700" {...register(path("longitude"))} />
        </Field>
        <div className="col-span-2 flex gap-2 sm:col-span-1 sm:pt-[22px]">
          <Button type="button" variant="outline" onClick={openPicker} className="flex-1">
            <MapPin /> {pin ? "Move pin" : "Pin on map"}
          </Button>
          {pin && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove pin"
              onClick={() => {
                set("latitude", "");
                set("longitude", "");
              }}
            >
              <X />
            </Button>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pin the site on the map</DialogTitle>
            <DialogDescription>Click the map to drop the pin, then drag it to the exact entrance.</DialogDescription>
          </DialogHeader>
          <div className="isolate h-[55vh] min-h-72">
            <PickerMap value={draft} onChange={setDraft} fallbackCenter={fallbackCenter} />
          </div>
          <DialogFooter className="items-center gap-2 sm:justify-between">
            <p className="text-muted-foreground text-xs tabular-nums">
              {draft ? `${draft.lat.toFixed(6)}, ${draft.lng.toFixed(6)}` : "No pin yet"}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={locate}>
                <LocateFixed /> My location
              </Button>
              <Button type="button" onClick={savePin} disabled={!draft}>
                Use this pin
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
