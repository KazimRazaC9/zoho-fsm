"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Boxes, Loader2, MoreHorizontal, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { handleResult } from "@/components/forms/apply-server-errors";
import { Field, NativeSelect } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatQty } from "@/lib/format";
import {
  adjustStockAction,
  deleteItemAction,
  saveItemAction,
  setItemActiveAction,
} from "@/modules/catalog/catalog.actions";
import {
  BLANK_ITEM,
  ITEM_TYPE_LABEL,
  ITEM_TYPES,
  itemToInput,
  serviceItemSchema,
  type ServiceItemDto,
  type ServiceItemInput,
} from "@/modules/catalog/catalog.schema";

/** "" → NaN so zod says "Enter a number." instead of silently saving 0. */
const asNumber = (v: unknown) => (v === "" || v == null ? Number.NaN : Number(v));
const asNullableNumber = (v: unknown) => (v === "" || v == null ? null : Number(v));

export function NewItemButton({ currency, defaultTaxPercent }: { currency: string; defaultTaxPercent: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> New item
      </Button>
      <ItemSheet open={open} onOpenChange={setOpen} currency={currency} defaultTaxPercent={defaultTaxPercent} />
    </>
  );
}

function ItemSheet({
  open,
  onOpenChange,
  item,
  currency,
  defaultTaxPercent = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ServiceItemDto;
  currency: string;
  defaultTaxPercent?: number;
}) {
  const form = useForm<ServiceItemInput>({ resolver: zodResolver(serviceItemSchema), defaultValues: BLANK_ITEM });
  const { register, handleSubmit, reset, setError, watch, formState } = form;
  const e = formState.errors;
  const type = watch("type");

  useEffect(() => {
    if (open) reset(item ? itemToInput(item) : { ...BLANK_ITEM, taxPercent: defaultTaxPercent });
  }, [open, item, defaultTaxPercent, reset]);

  const onSubmit = handleSubmit(async (v) => {
    const res = await saveItemAction(item?.id ?? null, v);
    if (handleResult(res, setError, item ? "Item saved." : `${v.name} was added.`)) onOpenChange(false);
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{item ? `Edit ${item.name}` : "New catalog item"}</SheetTitle>
          <SheetDescription>Prices are in {currency}. Line items copy the price when they are added.</SheetDescription>
        </SheetHeader>
        <form id="item-form" onSubmit={onSubmit} noValidate className="space-y-4 px-4">
          <div className="grid grid-cols-[1fr_140px] gap-4">
            <Field label="Name" htmlFor="it-name" error={e.name?.message}>
              <Input id="it-name" {...register("name")} aria-invalid={!!e.name} />
            </Field>
            <Field label="Type" htmlFor="it-type" error={e.type?.message}>
              <NativeSelect id="it-type" {...register("type")}>
                {ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ITEM_TYPE_LABEL[t]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="SKU / code" htmlFor="it-sku" error={e.sku?.message} hint="Optional, unique in your company.">
            <Input id="it-sku" className="font-mono" {...register("sku")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={`Unit price (${currency})`} htmlFor="it-price" error={e.unitPrice?.message}>
              <Input
                id="it-price"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                {...register("unitPrice", { setValueAs: asNumber })}
                aria-invalid={!!e.unitPrice}
              />
            </Field>
            <Field label="Tax %" htmlFor="it-tax" error={e.taxPercent?.message}>
              <Input
                id="it-tax"
                type="number"
                step="0.01"
                min="0"
                max="100"
                inputMode="decimal"
                {...register("taxPercent", { setValueAs: asNumber })}
              />
            </Field>
          </div>
          {type === "PART" && (
            <Field
              label="Stock on hand"
              htmlFor="it-stock"
              error={e.stockQty?.message}
              hint="Leave empty if you do not track stock for this part. Use “Adjust stock” for later changes."
            >
              <Input
                id="it-stock"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                {...register("stockQty", { setValueAs: asNullableNumber })}
              />
            </Field>
          )}
        </form>
        <SheetFooter>
          <Button type="submit" form="item-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            {item ? "Save changes" : "Add item"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function StockDialog({
  item,
  open,
  onOpenChange,
}: {
  item: ServiceItemDto;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [mode, setMode] = useState<"in" | "out">("in");
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMode("in");
      setQty("");
      setError(undefined);
    }
  }, [open]);

  const n = Number(qty);
  const after = qty && !Number.isNaN(n) ? (item.stockQty ?? 0) + (mode === "in" ? n : -n) : null;

  const submit = async () => {
    if (!qty || Number.isNaN(n) || n <= 0) return setError("Enter a quantity greater than 0.");
    setBusy(true);
    const res = await adjustStockAction(item.id, mode === "in" ? n : -n);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success(`${item.name}: ${formatQty(res.data.stockQty ?? 0)} in stock.`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {item.name} — {formatQty(item.stockQty ?? 0)} in stock now.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant={mode === "in" ? "default" : "outline"} onClick={() => setMode("in")}>
            Receive (+)
          </Button>
          <Button type="button" variant={mode === "out" ? "default" : "outline"} onClick={() => setMode("out")}>
            Remove (−)
          </Button>
        </div>
        <Field
          label="Quantity"
          htmlFor="stock-qty"
          error={error}
          hint={after != null ? `Stock after: ${formatQty(after)}` : undefined}
        >
          <Input
            id="stock-qty"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DialogKind = "edit" | "stock" | "toggle" | "delete" | null;

export function ItemRowActions({ item, currency }: { item: ServiceItemDto; currency: string }) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const close = (o: boolean) => !o && setDialog(null);
  const tracked = item.type === "PART" && item.stockQty != null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${item.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil /> Edit
          </DropdownMenuItem>
          {tracked && (
            <DropdownMenuItem onSelect={() => setDialog("stock")}>
              <Boxes /> Adjust stock
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setDialog("toggle")}>
            <Power /> {item.isActive ? "Deactivate" : "Activate"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ItemSheet open={dialog === "edit"} onOpenChange={close} item={item} currency={currency} />
      {tracked && <StockDialog item={item} open={dialog === "stock"} onOpenChange={close} />}
      <ConfirmDialog
        open={dialog === "toggle"}
        onOpenChange={close}
        title={item.isActive ? `Deactivate ${item.name}?` : `Activate ${item.name}?`}
        description={
          item.isActive
            ? "It is hidden from pickers for new estimates, jobs and invoices. Existing documents are not changed."
            : "It can be picked again on new estimates, jobs and invoices."
        }
        confirmLabel={item.isActive ? "Deactivate" : "Activate"}
        onConfirm={async () => {
          const res = await setItemActiveAction(item.id, !item.isActive);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success(item.isActive ? `${item.name} deactivated.` : `${item.name} activated.`);
        }}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={close}
        title={`Delete ${item.name}?`}
        description="It is removed from the catalog. Documents that already use it keep their own copy of the name and price."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const res = await deleteItemAction(item.id);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success(`${item.name} was deleted.`);
        }}
      />
    </>
  );
}
