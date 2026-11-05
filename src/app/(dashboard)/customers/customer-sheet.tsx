"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Controller, useFieldArray, useForm, type Resolver } from "react-hook-form";
import { AddressFields } from "@/components/forms/address-fields";
import { handleResult } from "@/components/forms/apply-server-errors";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { createCustomerAction, updateCustomerAction } from "@/modules/customers/customers.actions";
import {
  BLANK_ADDRESS,
  createCustomerSchema,
  CUSTOMER_TYPE_LABEL,
  CUSTOMER_TYPES,
  updateCustomerSchema,
  type CreateCustomerInput,
  type CustomerDto,
} from "@/modules/customers/customers.schema";

const defaults = (c?: CustomerDto): CreateCustomerInput => ({
  type: c?.type ?? "INDIVIDUAL",
  name: c?.name ?? "",
  email: c?.email ?? "",
  phone: c?.phone ?? "",
  notes: c?.notes ?? "",
  addresses: c ? [] : [{ ...BLANK_ADDRESS }],
});

/** New customer (with its first sites) or edit of the contact details. Sites are edited on the detail page. */
export function CustomerSheet({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: CustomerDto;
}) {
  const editing = !!customer;
  const router = useRouter();
  const form = useForm<CreateCustomerInput>({
    resolver: zodResolver(
      editing ? updateCustomerSchema : createCustomerSchema,
    ) as unknown as Resolver<CreateCustomerInput>,
    defaultValues: defaults(customer),
  });
  const { register, control, handleSubmit, setError, reset, formState } = form;
  const addresses = useFieldArray({ control, name: "addresses" });
  const e = formState.errors;

  useEffect(() => {
    if (open) reset(defaults(customer));
  }, [open, customer, reset]);

  const onSubmit = handleSubmit(async (v) => {
    if (editing) {
      const res = await updateCustomerAction(customer.id, {
        type: v.type,
        name: v.name,
        email: v.email,
        phone: v.phone,
        notes: v.notes,
      });
      if (handleResult(res, setError, "Customer saved.")) onOpenChange(false);
      return;
    }
    const res = await createCustomerAction(v);
    if (handleResult(res, setError, `${v.name} was added.`)) {
      onOpenChange(false);
      router.push(`/customers/${res.data.id}`);
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{editing ? `Edit ${customer.name}` : "New customer"}</SheetTitle>
          <SheetDescription>
            {editing
              ? "Contact details. Manage sites on the customer page."
              : "Contact details and at least one service address."}
          </SheetDescription>
        </SheetHeader>

        <form id="customer-form" onSubmit={onSubmit} noValidate className="space-y-4 px-4">
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <Field label="Type" error={e.type?.message}>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" aria-label="Customer type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CUSTOMER_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {CUSTOMER_TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Name" htmlFor="c-name" error={e.name?.message}>
              <Input id="c-name" autoComplete="off" {...register("name")} aria-invalid={!!e.name} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="c-email" error={e.email?.message}>
              <Input id="c-email" type="email" autoComplete="off" {...register("email")} />
            </Field>
            <Field label="Phone" htmlFor="c-phone" error={e.phone?.message}>
              <Input id="c-phone" type="tel" {...register("phone")} />
            </Field>
          </div>
          <Field
            label="Notes"
            htmlFor="c-notes"
            error={e.notes?.message}
            hint="Gate codes, preferred times, billing contact…"
          >
            <Textarea id="c-notes" rows={3} {...register("notes")} />
          </Field>

          {!editing && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Service addresses</p>
                  <p className="text-muted-foreground text-xs">
                    Where technicians go. Pin each one so it shows on the map.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addresses.append({ ...BLANK_ADDRESS })}
                  disabled={addresses.fields.length >= 20}
                >
                  <Plus /> Add address
                </Button>
              </div>
              {e.addresses?.root?.message || e.addresses?.message ? (
                <p className="text-destructive text-sm">{e.addresses?.root?.message ?? e.addresses?.message}</p>
              ) : null}
              {addresses.fields.map((f, i) => (
                <div key={f.id} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Address {i + 1}</p>
                    {addresses.fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Remove address ${i + 1}`}
                        onClick={() => addresses.remove(i)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                  <AddressFields form={form} name={`addresses.${i}`} idPrefix={`a${i}`} />
                </div>
              ))}
            </>
          )}
        </form>

        <SheetFooter>
          <Button type="submit" form="customer-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            {editing ? "Save changes" : "Create customer"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
