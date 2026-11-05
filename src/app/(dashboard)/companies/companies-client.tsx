"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Power, Wand2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { handleResult } from "@/components/forms/apply-server-errors";
import { RegionalFields } from "@/components/forms/company-fields";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { generatePassword } from "@/lib/password";
import { createCompanyAction, setCompanyActiveAction } from "@/modules/companies/companies.actions";
import {
  createCompanySchema,
  type CompanyListItem,
  type CreateCompanyInput,
} from "@/modules/companies/companies.schema";

const blank: CreateCompanyInput = {
  name: "",
  email: "",
  phone: "",
  timeZone: "UTC",
  currency: "USD",
  taxPercent: 0,
  admin: { fullName: "", email: "", password: "" },
};

/** Super Admin: a new tenant and its first Admin login. */
export function NewCompanyButton() {
  const [open, setOpen] = useState(false);
  const [shownPassword, setShownPassword] = useState(false);
  const form = useForm<CreateCompanyInput>({ resolver: zodResolver(createCompanySchema), defaultValues: blank });
  const { register, handleSubmit, setError, setValue, reset, formState } = form;
  const e = formState.errors;

  const onSubmit = handleSubmit(async (v) => {
    const res = await createCompanyAction(v);
    if (handleResult(res, setError, `${v.name} created. Send ${v.admin.email} their password securely.`)) {
      setOpen(false);
      reset(blank);
    }
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> New company
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>New company</SheetTitle>
            <SheetDescription>
              Creates the tenant and its first Admin, who can then add the rest of the team.
            </SheetDescription>
          </SheetHeader>
          <form id="company-form" onSubmit={onSubmit} noValidate className="space-y-4 px-4">
            <Field label="Company name" htmlFor="c-name" error={e.name?.message}>
              <Input id="c-name" {...register("name")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" htmlFor="c-email" error={e.email?.message}>
                <Input id="c-email" type="email" {...register("email")} />
              </Field>
              <Field label="Phone" htmlFor="c-phone" error={e.phone?.message}>
                <Input id="c-phone" type="tel" {...register("phone")} />
              </Field>
            </div>
            <RegionalFields register={register} errors={e} />

            <Separator />
            <p className="text-sm font-medium">First admin</p>
            <Field label="Full name" htmlFor="a-name" error={e.admin?.fullName?.message}>
              <Input id="a-name" {...register("admin.fullName")} />
            </Field>
            <Field label="Email" htmlFor="a-email" error={e.admin?.email?.message}>
              <Input id="a-email" type="email" autoComplete="off" {...register("admin.email")} />
            </Field>
            <Field label="Password" htmlFor="a-password" error={e.admin?.password?.message}>
              <div className="flex gap-2">
                <PasswordInput
                  id="a-password"
                  autoComplete="new-password"
                  visible={shownPassword}
                  onVisibleChange={setShownPassword}
                  {...register("admin.password")}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setValue("admin.password", generatePassword(), { shouldValidate: true });
                    setShownPassword(true);
                  }}
                >
                  <Wand2 /> Generate
                </Button>
              </div>
            </Field>
          </form>
          <SheetFooter>
            <Button type="submit" form="company-form" disabled={formState.isSubmitting}>
              {formState.isSubmitting && <Loader2 className="animate-spin" />}
              Create company
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function CompanyStatusButton({ company }: { company: CompanyListItem }) {
  const [open, setOpen] = useState(false);
  const disable = company.isActive;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Power /> {disable ? "Disable" : "Enable"}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={disable ? `Disable ${company.name}?` : `Enable ${company.name}?`}
        description={
          disable
            ? `All ${company.userCount} users are signed out at once and cannot sign in until the company is enabled again. No data is deleted.`
            : "Its users will be able to sign in again."
        }
        confirmLabel={disable ? "Disable company" : "Enable company"}
        destructive={disable}
        onConfirm={async () => {
          const res = await setCompanyActiveAction(company.id, !disable);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success(disable ? `${company.name} disabled.` : `${company.name} enabled.`);
        }}
      />
    </>
  );
}
