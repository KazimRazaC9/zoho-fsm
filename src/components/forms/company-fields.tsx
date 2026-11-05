"use client";

import { useMemo } from "react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { Field, NativeSelect } from "./field";
import { Input } from "@/components/ui/input";
import { COMMON_TIME_ZONES } from "@/lib/validation";

type Regional = { timeZone: string; currency: string; taxPercent: number };

/** Every IANA zone the browser knows, common ones first. */
function useTimeZones(current: string | undefined) {
  return useMemo(() => {
    const all: string[] =
      typeof Intl !== "undefined" && "supportedValuesOf" in Intl
        ? (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone")
        : [...COMMON_TIME_ZONES];
    const rest = all.filter((z) => !(COMMON_TIME_ZONES as readonly string[]).includes(z));
    const list = [...COMMON_TIME_ZONES, ...rest];
    if (current && !list.includes(current)) list.unshift(current);
    return list;
  }, [current]);
}

/** Time zone, currency and tax — shared by company settings and the Super Admin "new company" form. */
export function RegionalFields<T extends Regional>({
  register,
  errors,
  currentTimeZone,
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<Regional>;
  currentTimeZone?: string;
}) {
  const zones = useTimeZones(currentTimeZone);
  const r = register as unknown as UseFormRegister<Regional>;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="Time zone" htmlFor="timeZone" error={errors.timeZone?.message} className="sm:col-span-3">
        <NativeSelect id="timeZone" {...r("timeZone")}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replaceAll("_", " ")}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Currency" htmlFor="currency" error={errors.currency?.message} hint="ISO code, e.g. PKR, USD">
        <Input
          id="currency"
          maxLength={3}
          className="uppercase"
          {...r("currency", { setValueAs: (v: string) => v.toUpperCase() })}
        />
      </Field>
      <Field label="Default tax %" htmlFor="taxPercent" error={errors.taxPercent?.message}>
        <Input
          id="taxPercent"
          type="number"
          step="0.001"
          min={0}
          max={100}
          {...r("taxPercent", { valueAsNumber: true })}
        />
      </Field>
    </div>
  );
}
