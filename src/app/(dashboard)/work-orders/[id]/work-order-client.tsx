"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { WorkOrderStatus } from "@prisma/client";
import { FileText, ListChecks, Loader2, Lock, Paperclip, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { WorkOrderSheet } from "../work-order-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { handleResult } from "@/components/forms/apply-server-errors";
import { Field, NativeSelect } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ServiceItemDto } from "@/modules/catalog/catalog.schema";
import type { ChecklistTemplateOption } from "@/modules/checklists/checklists.schema";
import type { CustomerOption } from "@/modules/customers/customers.schema";
import { isClosed, nextStatuses, REASON_REQUIRED, transitionLabel } from "@/modules/work-orders/work-order-status";
import {
  addChecklistItemAction,
  addNoteAction,
  applyChecklistTemplateAction,
  changeWorkOrderStatusAction,
  deleteAttachmentAction,
  deleteChecklistItemAction,
  deleteLineAction,
  deleteNoteAction,
  deleteWorkOrderAction,
  saveLineAction,
  setChecklistItemAction,
} from "@/modules/work-orders/work-orders.actions";
import { lineSchema, type LineInput, type WorkOrderDetail } from "@/modules/work-orders/work-orders.schema";

type Ctx = { wo: WorkOrderDetail; currency: string; role: string; userId: string };

const fail = (res: { ok: boolean; error?: string }) => {
  if (!res.ok) toast.error(res.error);
  return !res.ok;
};

// ================================================================ header: status moves + edit/delete
export function StatusActions({
  wo,
  role,
  canQa,
  customers,
}: {
  wo: WorkOrderDetail;
  role: string;
  canQa: boolean;
  customers: CustomerOption[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState<WorkOrderStatus | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const moves = nextStatuses(wo.status, role, canQa);
  const primary: WorkOrderStatus[] = ["SCHEDULED", "DISPATCHED", "IN_PROGRESS", "COMPLETED", "CLOSED"];

  const move = async (to: WorkOrderStatus, why = "") => {
    setBusy(true);
    const res = await changeWorkOrderStatusAction(wo.id, { status: to, reason: why });
    setBusy(false);
    if (fail(res)) return false;
    toast.success(`${wo.number}: ${transitionLabel(wo.status, to).toLowerCase()} done.`);
    setTarget(null);
    return true;
  };

  const click = (to: WorkOrderStatus) => {
    if (REASON_REQUIRED(wo.status, to)) {
      setReason("");
      setTarget(to);
    } else void move(to);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {moves.map((to) => (
        <Button
          key={to}
          size="sm"
          variant={
            primary.includes(to) && (!isClosed(wo.status) || (wo.status === "COMPLETED" && to === "CLOSED"))
              ? "default"
              : "outline"
          }
          onClick={() => click(to)}
          disabled={busy}
          className={to === "CANCELLED" ? "text-destructive" : undefined}
        >
          {transitionLabel(wo.status, to)}
        </Button>
      ))}
      {!isClosed(wo.status) && (
        <Button size="sm" variant="ghost" onClick={() => setDialog("edit")}>
          <Pencil /> Edit
        </Button>
      )}
      {role === "ADMIN" && (wo.status === "NEW" || wo.status === "CANCELLED") && (
        <Button size="sm" variant="ghost" onClick={() => setDialog("delete")} aria-label="Delete work order">
          <Trash2 />
        </Button>
      )}

      <Dialog open={!!target} onOpenChange={(o) => !o && !busy && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{target && transitionLabel(wo.status, target)}</DialogTitle>
            <DialogDescription>The reason is saved on the status timeline.</DialogDescription>
          </DialogHeader>
          <Field label="Reason" htmlFor="st-reason">
            <Textarea id="st-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={busy}>
              Back
            </Button>
            <Button onClick={() => target && move(target, reason)} disabled={busy || !reason.trim()}>
              {busy && <Loader2 className="animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WorkOrderSheet
        open={dialog === "edit"}
        onOpenChange={(o) => !o && setDialog(null)}
        customers={customers}
        workOrder={wo}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Delete ${wo.number}?`}
        description="It disappears from lists. The number is not reused."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const res = await deleteWorkOrderAction(wo.id);
          if (fail(res)) return false;
          toast.success(`${wo.number} deleted.`);
          router.push("/work-orders");
        }}
      />
    </div>
  );
}

function ClosedHint({ wo }: { wo: WorkOrderDetail }) {
  if (!isClosed(wo.status)) return null;
  return (
    <p className="text-muted-foreground flex items-center gap-1 text-xs">
      <Lock className="size-3" />{" "}
      {wo.status === "COMPLETED"
        ? "Completed by the technician — waiting for QA to verify and close."
        : wo.status === "CLOSED"
          ? "Closed — an Admin can reopen it."
          : "Cancelled — an Admin can reopen it."}
    </p>
  );
}

// ================================================================ lines
const asNumber = (v: unknown) => (v === "" || v == null ? Number.NaN : Number(v));

export function LinesSection({ wo, currency, items }: Ctx & { items: ServiceItemDto[] }) {
  const [editing, setEditing] = useState<WorkOrderDetail["lines"][number] | "new" | null>(null);
  const closed = isClosed(wo.status);
  const money = (n: number) => formatCurrency(n, currency);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Services & parts</CardTitle>
          <ClosedHint wo={wo} />
        </div>
        {!closed && (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Plus /> Add line
          </Button>
        )}
      </CardHeader>
      <CardContent className="px-0">
        {wo.lines.length === 0 ? (
          <p className="text-muted-foreground px-6 py-4 text-sm">
            No lines yet. Add the services and parts for this job.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Unit price</TableHead>
                <TableHead className="hidden text-right md:table-cell">Tax</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {!closed && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {wo.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="pl-6">{l.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQty(l.qty)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{money(l.unitPrice)}</TableCell>
                  <TableCell className="text-muted-foreground hidden text-right tabular-nums md:table-cell">
                    {formatQty(l.taxPercent)}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(l.lineTotal)}</TableCell>
                  {!closed && (
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
                            const res = await deleteLineAction(wo.id, l.id);
                            if (!fail(res)) toast.success("Line removed.");
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
              {(
                [
                  ["Subtotal", wo.totals.subTotal],
                  ["Tax", wo.totals.tax],
                  ["Total", wo.totals.total],
                ] as const
              ).map(([k, v]) => (
                <TableRow key={k} className={k === "Total" ? "font-semibold" : "text-muted-foreground"}>
                  <TableCell className="pl-6" colSpan={2}>
                    {k}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell" />
                  <TableCell className="hidden md:table-cell" />
                  <TableCell className="text-right tabular-nums">{money(v)}</TableCell>
                  {!closed && <TableCell />}
                </TableRow>
              ))}
            </TableFooter>
          </Table>
        )}
      </CardContent>
      <LineDialog
        woId={wo.id}
        line={editing === "new" ? undefined : (editing ?? undefined)}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        items={items}
        currency={currency}
      />
    </Card>
  );
}

function LineDialog({
  woId,
  line,
  open,
  onOpenChange,
  items,
  currency,
}: {
  woId: string;
  line?: WorkOrderDetail["lines"][number];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: ServiceItemDto[];
  currency: string;
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

  const onSubmit = handleSubmit(async (v) => {
    const res = await saveLineAction(woId, line?.id ?? null, v);
    if (handleResult(res, setError, line ? "Line saved." : "Line added.")) onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{line ? "Edit line" : "Add line"}</DialogTitle>
          <DialogDescription>Pick from the catalog to copy its price and tax, or type a free line.</DialogDescription>
        </DialogHeader>
        <form id="line-form" onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label="Catalog item" htmlFor="ln-item">
            <NativeSelect
              id="ln-item"
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
                        {i.stockQty != null ? ` (${formatQty(i.stockQty)} in stock)` : ""}
                      </option>
                    ))}
                </optgroup>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Description" htmlFor="ln-desc" error={e.description?.message}>
            <Input id="ln-desc" {...register("description")} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Qty" htmlFor="ln-qty" error={e.qty?.message}>
              <Input id="ln-qty" type="number" step="0.01" min="0" {...register("qty", { setValueAs: asNumber })} />
            </Field>
            <Field label={`Price (${currency})`} htmlFor="ln-price" error={e.unitPrice?.message}>
              <Input
                id="ln-price"
                type="number"
                step="0.01"
                min="0"
                {...register("unitPrice", { setValueAs: asNumber })}
              />
            </Field>
            <Field label="Tax %" htmlFor="ln-tax" error={e.taxPercent?.message}>
              <Input
                id="ln-tax"
                type="number"
                step="0.01"
                min="0"
                max="100"
                {...register("taxPercent", { setValueAs: asNumber })}
              />
            </Field>
          </div>
          <p className="text-muted-foreground text-right text-sm">
            Amount before tax: <span className="text-foreground font-medium">{formatCurrency(amount, currency)}</span>
          </p>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="line-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" />}
            {line ? "Save line" : "Add line"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ================================================================ checklist
export function ChecklistSection({ wo, templates }: Ctx & { templates: ChecklistTemplateOption[] }) {
  const [text, setText] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const closed = isClosed(wo.status);
  const done = wo.checklist.filter((c) => c.isDone).length;

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const res = await addChecklistItemAction(wo.id, text);
    setBusy(false);
    if (!fail(res)) setText("");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="size-4" /> Checklist
            {wo.checklist.length > 0 && (
              <span className="text-muted-foreground text-sm font-normal">
                {done}/{wo.checklist.length}
              </span>
            )}
          </CardTitle>
          {!closed && wo.checklist.length > done && (
            <p className="text-muted-foreground text-xs">All items must be done before the job can be completed.</p>
          )}
          <ClosedHint wo={wo} />
        </div>
        {!closed && templates.length > 0 && (
          <div className="flex gap-2">
            <NativeSelect
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="h-8 w-44 text-xs"
              aria-label="Template"
            >
              <option value="">Add from template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
            <Button
              size="sm"
              variant="outline"
              disabled={!templateId || busy}
              onClick={async () => {
                setBusy(true);
                const res = await applyChecklistTemplateAction(wo.id, templateId);
                setBusy(false);
                if (!fail(res)) {
                  setTemplateId("");
                  toast.success("Template items added.");
                }
              }}
            >
              Add
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {wo.checklist.length === 0 && <p className="text-muted-foreground text-sm">No checklist on this job.</p>}
        {wo.checklist.map((c) => (
          <div key={c.id} className="group hover:bg-muted/50 flex items-start gap-3 rounded-md px-2 py-1.5">
            <Checkbox
              id={`ck-${c.id}`}
              checked={c.isDone}
              disabled={closed}
              className="mt-0.5"
              onCheckedChange={async (v) => {
                await setChecklistItemAction(wo.id, c.id, v === true).then(fail);
              }}
            />
            <label htmlFor={`ck-${c.id}`} className="flex-1 text-sm">
              <span className={cn(c.isDone && "text-muted-foreground line-through")}>{c.text}</span>
              {c.isDone && c.doneBy && (
                <span className="text-muted-foreground block text-xs">
                  {c.doneBy} ·{" "}
                  {new Date(c.doneAt!).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              )}
            </label>
            {!closed && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label="Remove item"
                onClick={() => deleteChecklistItemAction(wo.id, c.id).then(fail)}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        ))}
        {!closed && (
          <form
            className="flex gap-2 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an item…" maxLength={300} />
            <Button type="submit" variant="outline" disabled={busy || !text.trim()}>
              <Plus /> Add
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ================================================================ notes
export function NotesSection({ wo, role, userId }: Ctx) {
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(true);
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            setBusy(true);
            const res = await addNoteAction(wo.id, { text, isInternal: internal });
            setBusy(false);
            if (!fail(res)) setText("");
          }}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Write a note…"
            maxLength={4000}
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch id="note-internal" checked={internal} onCheckedChange={setInternal} />
              <Label htmlFor="note-internal" className="text-sm font-normal">
                {internal ? "Internal (staff only)" : "Customer can see"}
              </Label>
            </div>
            <Button type="submit" size="sm" disabled={busy || !text.trim()}>
              {busy && <Loader2 className="animate-spin" />}
              Add note
            </Button>
          </div>
        </form>
        {wo.notes.length === 0 && <p className="text-muted-foreground text-sm">No notes yet.</p>}
        <ul className="space-y-3">
          {wo.notes.map((n) => (
            <li key={n.id} className="group rounded-md border p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                  <span className="text-foreground font-medium">{n.author ?? "Someone"}</span> ·{" "}
                  {new Date(n.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                  {!n.isInternal && (
                    <span className="ml-2 rounded bg-blue-100 px-1.5 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      customer-visible
                    </span>
                  )}
                </p>
                {(role === "ADMIN" || n.authorId === userId) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label="Delete note"
                    onClick={() => deleteNoteAction(wo.id, n.id).then(fail)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              <p className="text-sm whitespace-pre-line">{n.text}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ================================================================ attachments
const ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.pdf,.txt,.csv,.docx,.xlsx";
const kb = (n: number | null) =>
  n == null ? "" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;

export function AttachmentsSection({ wo }: Ctx) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const closed = isClosed(wo.status);
  const photos = wo.attachments.filter((a) => a.kind === "PHOTO" || a.kind === "SIGNATURE");
  const docs = wo.attachments.filter((a) => a.kind === "DOCUMENT");

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(files.length);
    let ok = 0;
    for (const file of Array.from(files)) {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/v1/work-orders/${wo.id}/attachments`, { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { message?: string };
      if (res.ok) ok++;
      else toast.error(`${file.name}: ${json.message ?? "upload failed"}`);
      setUploading((n) => n - 1);
    }
    if (input.current) input.current.value = "";
    if (ok) {
      toast.success(`${ok} file${ok === 1 ? "" : "s"} uploaded.`);
      router.refresh();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Paperclip className="size-4" /> Photos & files ({wo.attachments.length})
          </CardTitle>
          <ClosedHint wo={wo} />
        </div>
        {!closed && (
          <>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => upload(e.target.files)}
            />
            <Button size="sm" variant="outline" onClick={() => input.current?.click()} disabled={uploading > 0}>
              {uploading > 0 ? <Loader2 className="animate-spin" /> : <Upload />}
              {uploading > 0 ? `Uploading ${uploading}…` : "Upload"}
            </Button>
          </>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {wo.attachments.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Before/after photos, job sheets, delivery notes. Images, PDF and Office files.
          </p>
        )}
        {photos.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((a) => (
              <figure key={a.id} className="group relative overflow-hidden rounded-md border">
                <a href={`/api/v1/attachments/${a.id}?inline=1`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API URL, not optimisable */}
                  <img
                    src={`/api/v1/attachments/${a.id}?inline=1`}
                    alt={a.fileName}
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                </a>
                <figcaption className="text-muted-foreground truncate px-2 py-1 text-xs">
                  {a.kind === "SIGNATURE" ? "Signature" : a.fileName}
                </figcaption>
                {!closed && <DeleteFile woId={wo.id} id={a.id} className="absolute top-1 right-1" />}
              </figure>
            ))}
          </div>
        )}
        {docs.length > 0 && (
          <ul className="divide-y rounded-md border">
            {docs.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                <FileText className="text-muted-foreground size-4 shrink-0" />
                <a href={`/api/v1/attachments/${a.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                  {a.fileName}
                </a>
                <span className="text-muted-foreground text-xs">{kb(a.sizeBytes)}</span>
                {!closed && <DeleteFile woId={wo.id} id={a.id} />}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DeleteFile({ woId, id, className }: { woId: string; id: string; className?: string }) {
  return (
    <Button
      variant="secondary"
      size="icon"
      className={cn("size-7", className)}
      aria-label="Delete file"
      onClick={async () => {
        const res = await deleteAttachmentAction(woId, id);
        if (!fail(res)) toast.success("File deleted.");
      }}
    >
      <Trash2 />
    </Button>
  );
}
