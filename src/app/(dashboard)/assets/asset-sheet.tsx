"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { handleResult } from "@/components/forms/apply-server-errors";
import { Field, NativeSelect } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { saveAssetAction } from "@/modules/assets/assets.actions";
import {
  ASSET_STATUS_LABEL,
  ASSET_STATUSES,
  assetSchema,
  assetToInput,
  type AssetDto,
  type AssetInput,
} from "@/modules/assets/assets.schema";
import type { CustomerOption } from "@/modules/customers/customers.schema";

const blank = (customerId = ""): AssetInput => ({
  customerId,
  addressId: "",
  name: "",
  category: "",
  brand: "",
  model: "",
  serialNo: "",
  installDate: "",
  warrantyEndDate: "",
  status: "ACTIVE",
});

/** Add or edit a piece of customer equipment. `fixedCustomerId` locks the customer (customer page). */
export function AssetSheet({
  open,
  onOpenChange,
  customers,
  asset,
  fixedCustomerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: CustomerOption[];
  asset?: AssetDto;
  fixedCustomerId?: string;
}) {
  const form = useForm<AssetInput>({ resolver: zodResolver(assetSchema), defaultValues: blank(fixedCustomerId) });
  const { register, handleSubmit, reset, setError, setValue, watch, formState } = form;
  const e = formState.errors;

  useEffect(() => {
    if (open) {
      const v = asset ? assetToInput(asset) : blank(fixedCustomerId);
      // Preselect the only site so a single-site customer needs no extra click.
      if (!asset && fixedCustomerId) {
        const sites = customers.find((c) => c.id === fixedCustomerId)?.addresses ?? [];
        if (sites.length === 1) v.addressId = sites[0].id;
      }
      reset(v);
    }
  }, [open, asset, fixedCustomerId, customers, reset]);

  const customerId = watch("customerId");
  const sites = customers.find((c) => c.id === customerId)?.addresses ?? [];

  const onSubmit = handleSubmit(async (v) => {
    const res = await saveAssetAction(asset?.id ?? null, v);
    if (handleResult(res, setError, asset ? "Asset saved." : `${v.name} was added.`)) onOpenChange(false);
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{asset ? `Edit ${asset.name}` : "New asset"}</SheetTitle>
          <SheetDescription>Equipment you service at a customer site, with its warranty.</SheetDescription>
        </SheetHeader>

        <form id="asset-form" onSubmit={onSubmit} noValidate className="space-y-4 px-4">
          <Field label="Customer" htmlFor="as-customer" error={e.customerId?.message}>
            {fixedCustomerId ? (
              <>
                <Input id="as-customer" value={customers.find((c) => c.id === fixedCustomerId)?.name ?? ""} readOnly />
                <input type="hidden" {...register("customerId")} />
              </>
            ) : (
              <NativeSelect
                id="as-customer"
                {...register("customerId", { onChange: () => setValue("addressId", "") })}
                aria-invalid={!!e.customerId}
              >
                <option value="">Choose a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label="Site" htmlFor="as-site" error={e.addressId?.message}>
            <NativeSelect id="as-site" {...register("addressId")}>
              <option value="">No specific site</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Name" htmlFor="as-name" error={e.name?.message}>
            <Input id="as-name" placeholder="Split AC — Bedroom" {...register("name")} aria-invalid={!!e.name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="as-cat" error={e.category?.message}>
              <Input id="as-cat" placeholder="Split AC, Chiller…" {...register("category")} />
            </Field>
            <Field label="Status" htmlFor="as-status" error={e.status?.message}>
              <NativeSelect id="as-status" {...register("status")}>
                {ASSET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ASSET_STATUS_LABEL[s]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Brand" htmlFor="as-brand" error={e.brand?.message}>
              <Input id="as-brand" {...register("brand")} />
            </Field>
            <Field label="Model" htmlFor="as-model" error={e.model?.message}>
              <Input id="as-model" {...register("model")} />
            </Field>
          </div>
          <Field label="Serial number" htmlFor="as-serial" error={e.serialNo?.message}>
            <Input id="as-serial" {...register("serialNo")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Install date" htmlFor="as-install" error={e.installDate?.message}>
              <Input id="as-install" type="date" {...register("installDate")} />
            </Field>
            <Field label="Warranty ends" htmlFor="as-warranty" error={e.warrantyEndDate?.message}>
              <Input id="as-warranty" type="date" {...register("warrantyEndDate")} aria-invalid={!!e.warrantyEndDate} />
            </Field>
          </div>
        </form>

        <SheetFooter>
          <Button type="submit" form="asset-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            {asset ? "Save changes" : "Add asset"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
