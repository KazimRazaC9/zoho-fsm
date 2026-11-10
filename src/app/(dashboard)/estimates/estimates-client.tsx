"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { handleResult } from "@/components/forms/apply-server-errors";
import { Field, NativeSelect } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerOption } from "@/modules/customers/customers.schema";
import { saveEstimateAction } from "@/modules/estimates/estimates.actions";
import { estimateSchema, type EstimateInput } from "@/modules/estimates/estimates.schema";

export type RequestOption = { id: string; number: string; title: string; customerId: string; addressId: string };

const blank: EstimateInput = { customerId: "", addressId: "", requestId: "", validUntil: "", notes: "" };

export function NewEstimateButton({
  customers,
  requests,
  openForRequest,
}: {
  customers: CustomerOption[];
  requests: RequestOption[];
  /** A request id from the URL (?request=…): open the form already filled in for it. */
  openForRequest?: string;
}) {
  const [open, setOpen] = useState(!!openForRequest && requests.some((r) => r.id === openForRequest));
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> New estimate
      </Button>
      <EstimateSheet
        open={open}
        onOpenChange={setOpen}
        customers={customers}
        requests={requests}
        initialRequestId={openForRequest}
      />
    </>
  );
}

export function EstimateSheet({
  open,
  onOpenChange,
  customers,
  requests,
  initialRequestId,
  estimate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customers: CustomerOption[];
  requests: RequestOption[];
  initialRequestId?: string;
  /** Editing an existing draft (customer and request stay fixed). */
  estimate?: { id: string; number: string; value: EstimateInput };
}) {
  const router = useRouter();
  const form = useForm<EstimateInput>({ resolver: zodResolver(estimateSchema), defaultValues: blank });
  const { register, handleSubmit, reset, setValue, watch, setError, formState } = form;
  const e = formState.errors;
  const customerId = watch("customerId");
  const customer = customers.find((c) => c.id === customerId);
  const customerRequests = requests.filter((r) => r.customerId === customerId);

  useEffect(() => {
    if (!open) return;
    if (estimate) return reset(estimate.value);
    const r = requests.find((x) => x.id === initialRequestId);
    reset(r ? { ...blank, customerId: r.customerId, addressId: r.addressId, requestId: r.id } : blank);
  }, [open, estimate, initialRequestId, requests, reset]);

  const onSubmit = handleSubmit(async (v) => {
    const res = await saveEstimateAction(estimate?.id ?? null, v);
    if (handleResult(res, setError, estimate ? "Estimate saved." : `${res.ok ? res.data.number : ""} created.`)) {
      onOpenChange(false);
      if (!estimate && res.ok) router.push(`/estimates/${res.data.id}`);
      else router.refresh();
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{estimate ? `Edit ${estimate.number}` : "New estimate"}</SheetTitle>
          <SheetDescription>Choose who it is for, then add the services and parts on the next screen.</SheetDescription>
        </SheetHeader>
        <form id="estimate-form" onSubmit={onSubmit} noValidate className="space-y-4 px-4">
          <Field label="Customer" htmlFor="es-customer" error={e.customerId?.message}>
            <NativeSelect
              id="es-customer"
              disabled={!!estimate}
              {...register("customerId", {
                onChange: (ev: React.ChangeEvent<HTMLSelectElement>) => {
                  const next = customers.find((c) => c.id === ev.target.value);
                  setValue("addressId", next?.addresses.length === 1 ? next.addresses[0].id : "");
                  setValue("requestId", "");
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
          <Field label="Site" htmlFor="es-site" error={e.addressId?.message}>
            <NativeSelect id="es-site" {...register("addressId")}>
              <option value="">{customer ? "No specific site" : "Choose a customer first"}</option>
              {(customer?.addresses ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {!estimate && (
            <Field
              label="For service request"
              htmlFor="es-request"
              hint="Optional. The request moves to Estimated while this is pending."
              error={e.requestId?.message}
            >
              <NativeSelect id="es-request" {...register("requestId")}>
                <option value="">None</option>
                {customerRequests.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.number} · {r.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field label="Valid until" htmlFor="es-valid" hint="Optional" error={e.validUntil?.message}>
            <Input id="es-valid" type="date" {...register("validUntil")} />
          </Field>
          <Field label="Notes for the customer" htmlFor="es-notes" hint="Optional" error={e.notes?.message}>
            <Textarea id="es-notes" rows={3} {...register("notes")} />
          </Field>
        </form>
        <SheetFooter>
          <Button type="submit" form="estimate-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            {estimate ? "Save changes" : "Create estimate"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
