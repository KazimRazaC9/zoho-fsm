"use client";

import type { FieldValues, UseFormReturn } from "react-hook-form";
import { Field, NativeSelect } from "@/components/forms/field";
import type { CustomerOption } from "@/modules/customers/customers.schema";

type JobTarget = { customerId: string; addressId: string; assetId: string };

/**
 * Customer → site → asset pickers shared by service requests and work orders.
 * Choosing an asset fills in its site; changing the customer clears both.
 */
export function JobTargetFields<T extends FieldValues & JobTarget>({
  form,
  customers,
  idPrefix,
}: {
  form: UseFormReturn<T>;
  customers: CustomerOption[];
  idPrefix: string;
}) {
  const f = form as unknown as UseFormReturn<JobTarget>;
  const { register, watch, setValue, formState } = f;
  const e = formState.errors;
  const customer = customers.find((c) => c.id === watch("customerId"));
  const sites = customer?.addresses ?? [];
  const assets = customer?.assets ?? [];
  const id = (k: string) => `${idPrefix}-${k}`;

  return (
    <>
      <Field label="Customer" htmlFor={id("customer")} error={e.customerId?.message}>
        <NativeSelect
          id={id("customer")}
          aria-invalid={!!e.customerId}
          {...register("customerId", {
            onChange: (ev: React.ChangeEvent<HTMLSelectElement>) => {
              const next = customers.find((c) => c.id === ev.target.value);
              setValue("addressId", next?.addresses.length === 1 ? next.addresses[0].id : "");
              setValue("assetId", "");
            },
          })}
        >
          <option value="">Choose a customer…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Site" htmlFor={id("site")} error={e.addressId?.message}>
          <NativeSelect id={id("site")} {...register("addressId")}>
            <option value="">{customer ? "No specific site" : "Choose a customer first"}</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Asset" htmlFor={id("asset")} error={e.assetId?.message}>
          <NativeSelect
            id={id("asset")}
            {...register("assetId", {
              onChange: (ev: React.ChangeEvent<HTMLSelectElement>) => {
                const a = assets.find((x) => x.id === ev.target.value);
                if (a?.addressId) setValue("addressId", a.addressId);
              },
            })}
          >
            <option value="">{assets.length ? "No specific asset" : "No assets"}</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
    </>
  );
}
