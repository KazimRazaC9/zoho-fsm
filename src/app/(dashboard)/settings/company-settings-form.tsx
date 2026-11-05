"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { handleResult } from "@/components/forms/apply-server-errors";
import { RegionalFields } from "@/components/forms/company-fields";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { updateCompanySettingsAction } from "@/modules/companies/companies.actions";
import {
  companySettingsSchema,
  type CompanyDto,
  type CompanySettingsInput,
} from "@/modules/companies/companies.schema";

export function CompanySettingsForm({ company }: { company: CompanyDto }) {
  const router = useRouter();
  const form = useForm<CompanySettingsInput>({
    resolver: zodResolver(companySettingsSchema),
    defaultValues: {
      name: company.name,
      email: company.email ?? "",
      phone: company.phone ?? "",
      address: company.address ?? "",
      logoUrl: company.logoUrl ?? "",
      timeZone: company.timeZone,
      currency: company.currency,
      taxPercent: company.taxPercent,
      requireSignatureOnComplete: company.requireSignatureOnComplete,
    },
  });
  const { register, control, handleSubmit, setError, watch, formState } = form;
  const e = formState.errors;
  const logoUrl = watch("logoUrl");

  const onSubmit = handleSubmit(async (v) => {
    const res = await updateCompanySettingsAction(v);
    if (handleResult(res, setError, "Company settings saved.")) {
      form.reset(v);
      router.refresh();
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company profile</CardTitle>
          <CardDescription>Shown on estimates, invoices and customer emails.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Company name" htmlFor="name" error={e.name?.message}>
            <Input id="name" {...register("name")} aria-invalid={!!e.name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="email" error={e.email?.message}>
              <Input id="email" type="email" {...register("email")} />
            </Field>
            <Field label="Phone" htmlFor="phone" error={e.phone?.message}>
              <Input id="phone" type="tel" {...register("phone")} />
            </Field>
          </div>
          <Field label="Address" htmlFor="address" error={e.address?.message}>
            <Textarea id="address" rows={2} {...register("address")} />
          </Field>
          <Field
            label="Logo URL"
            htmlFor="logoUrl"
            error={e.logoUrl?.message}
            hint="Link to a PNG or SVG. Logo upload arrives with file storage in Phase 3."
          >
            <div className="flex items-center gap-3">
              <Input id="logoUrl" type="url" placeholder="https://…" {...register("logoUrl")} />
              {logoUrl && /^https?:\/\//.test(logoUrl) && (
                // eslint-disable-next-line @next/next/no-img-element -- arbitrary external logo URL
                <img src={logoUrl} alt="Logo preview" className="size-9 rounded border object-contain" />
              )}
            </div>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regional settings</CardTitle>
          <CardDescription>
            Times are stored in UTC and shown in this time zone. Tax is the default for new price-list items.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegionalFields register={register} errors={e} currentTimeZone={company.timeZone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Job completion</CardTitle>
        </CardHeader>
        <CardContent>
          <Controller
            control={control}
            name="requireSignatureOnComplete"
            render={({ field }) => (
              <label className="flex items-center justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium">Require customer signature</span>
                  <span className="text-muted-foreground block text-sm">
                    Technicians cannot complete a work order without the customer&apos;s signature.
                  </span>
                </span>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </label>
            )}
          />
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={formState.isSubmitting || !formState.isDirty}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            Save settings
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
