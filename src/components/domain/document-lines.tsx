"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { handleResult } from "@/components/forms/apply-server-errors";
import { Field, NativeSelect } from "@/components/forms/field";
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
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import { formatCurrency, formatQty } from "@/lib/format";
import type { ServiceItemDto } from "@/modules/catalog/catalog.schema";
import type { DocLine } from "@/modules/estimates/estimates.schema";
import { lineSchema, type LineInput } from "@/modules/work-orders/work-orders.schema";

const asNumber = (v: unknown) => (v === "" || v == null ? Number.NaN : Number(v));

export type DocTotals = { subTotal: number; tax: number; discount?: number; total: number };

/**
 * Lines table + add/edit dialog shared by estimates and invoices. Totals shown here are the ones
 * the server calculated; the form only previews qty × price.
 */
export function DocumentLines({
  lines,
  items,
  currency,
  totals,
  editable,
  lockedHint,
  onSave,
  onDelete,
}: {
  lines: DocLine[];
  items: ServiceItemDto[];
  currency: string;
  totals: DocTotals;
  editable: boolean;
  lockedHint?: string;
  onSave: (lineId: string | null, input: LineInput) => Promise<ActionResult<unknown>>;
  onDelete: (lineId: string) => Promise<ActionResult<unknown>>;
}) {
  const [editing, setEditing] = useState<DocLine | "new" | null>(null);
  const money = (n: number) => formatCurrency(n, currency);

  const rows: [string, number][] = [
    ["Subtotal", totals.subTotal],
    ["Tax", totals.tax],
  ];
  if (totals.discount) rows.push(["Discount", -totals.discount]);
  rows.push(["Total", totals.total]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Lines</CardTitle>
          {!editable && lockedHint && <p className="text-muted-foreground mt-0.5 text-xs">{lockedHint}</p>}
        </div>
        {editable && (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Plus /> Add line
          </Button>
        )}
      </CardHeader>
      <CardContent className="px-0">
        {lines.length === 0 ? (
          <p className="text-muted-foreground px-6 py-4 text-sm">No lines yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Unit price</TableHead>
                <TableHead className="hidden text-right md:table-cell">Tax</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {editable && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="pl-6">{l.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQty(l.qty)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{money(l.unitPrice)}</TableCell>
                  <TableCell className="text-muted-foreground hidden text-right tabular-nums md:table-cell">
                    {formatQty(l.taxPercent)}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(l.lineTotal)}</TableCell>
                  {editable && (
                    <TableCell className="pr-4">
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label="Edit line"
                          onClick={() => setEditing(l)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label="Delete line"
                          onClick={async () => {
                            const res = await onDelete(l.id);
                            if (res.ok) toast.success("Line removed.");
                            else toast.error(res.error);
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              {rows.map(([k, v]) => (
                <TableRow key={k} className={k === "Total" ? "font-semibold" : "text-muted-foreground"}>
                  <TableCell className="pl-6" colSpan={2}>
                    {k}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell" />
                  <TableCell className="hidden md:table-cell" />
                  <TableCell className="text-right tabular-nums">{money(v)}</TableCell>
                  {editable && <TableCell />}
                </TableRow>
              ))}
            </TableFooter>
          </Table>
        )}
      </CardContent>
      <LineDialog
        line={editing === "new" ? undefined : (editing ?? undefined)}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        items={items}
        currency={currency}
        onSave={onSave}
      />
    </Card>
  );
}

function LineDialog({
  line,
  open,
  onOpenChange,
  items,
  currency,
  onSave,
}: {
  line?: DocLine;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: ServiceItemDto[];
  currency: string;
  onSave: (lineId: string | null, input: LineInput) => Promise<ActionResult<unknown>>;
}) {
  const blank: LineInput = { serviceItemId: "", description: "", qty: 1, unitPrice: 0, taxPercent: 0 };
  const form = useForm<LineInput>({ resolver: zodResolver(lineSchema), defaultValues: blank });
  const { register, handleSubmit, reset, setValue, setError, watch, formState } = form;
  const e = formState.errors;

  useEffect(() => {
    if (open)
      reset(
        line
          ? {
              serviceItemId: line.serviceItemId ?? "",
              description: line.description,
              qty: line.qty,
              unitPrice: line.unitPrice,
              taxPercent: line.taxPercent,
            }
          : blank,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- blank is constant
  }, [open, line, reset]);

  const qty = watch("qty");
  const price = watch("unitPrice");
  const amount = Number.isFinite(qty) && Number.isFinite(price) ? qty * price : 0;

  const submit = handleSubmit(async (v) => {
    const res = await onSave(line?.id ?? null, v);
    if (handleResult(res, setError, line ? "Line saved." : "Line added.")) onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{line ? "Edit line" : "Add line"}</DialogTitle>
          <DialogDescription>Pick from the catalog to copy its price and tax, or type a free line.</DialogDescription>
        </DialogHeader>
        <form id="doc-line-form" onSubmit={submit} noValidate className="space-y-4">
          <Field label="Catalog item" htmlFor="dl-item">
            <NativeSelect
              id="dl-item"
              {...register("serviceItemId", {
                onChange: (ev: React.ChangeEvent<HTMLSelectElement>) => {
                  const it = items.find((i) => i.id === ev.target.value);
                  if (!it) return;
                  setValue("description", it.name, { shouldValidate: true });
                  setValue("unitPrice", it.unitPrice, { shouldValidate: true });
                  setValue("taxPercent", it.taxPercent, { shouldValidate: true });
                },
              })}
            >
              <option value="">Free text</option>
              {(["SERVICE", "PART"] as const).map((type) => (
                <optgroup key={type} label={type === "SERVICE" ? "Services" : "Parts"}>
                  {items
                    .filter((i) => i.type === type)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} — {formatCurrency(i.unitPrice, currency)}
                      </option>
                    ))}
                </optgroup>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Description" htmlFor="dl-desc" error={e.description?.message}>
            <Input id="dl-desc" {...register("description")} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Qty" htmlFor="dl-qty" error={e.qty?.message}>
              <Input id="dl-qty" type="number" step="0.01" min="0" {...register("qty", { setValueAs: asNumber })} />
            </Field>
            <Field label={`Price (${currency})`} htmlFor="dl-price" error={e.unitPrice?.message}>
              <Input
                id="dl-price"
                type="number"
                step="0.01"
                min="0"
                {...register("unitPrice", { setValueAs: asNumber })}
              />
            </Field>
            <Field label="Tax %" htmlFor="dl-tax" error={e.taxPercent?.message}>
              <Input
                id="dl-tax"
                type="number"
                step="0.01"
                min="0"
                max="100"
                {...register("taxPercent", { setValueAs: asNumber })}
              />
            </Field>
          </div>
          <p className="text-muted-foreground text-sm">
            Amount before tax: <span className="text-foreground font-medium">{formatCurrency(amount, currency)}</span>
          </p>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="doc-line-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            {line ? "Save line" : "Add line"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
