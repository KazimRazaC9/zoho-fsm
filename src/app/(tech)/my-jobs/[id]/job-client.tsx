"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Clock,
  ListChecks,
  Loader2,
  MapPin,
  MessageSquare,
  Navigation,
  PauseCircle,
  PenLine,
  PlayCircle,
  Phone,
  Plus,
  Truck,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { PriorityText, WorkOrderStatusBadge } from "@/components/domain/badges";
import { EvidenceSection } from "@/components/domain/evidence-section";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { mapsUrl } from "@/modules/customers/customers.schema";
import {
  addJobIssueAction,
  addJobNoteAction,
  addJobPartAction,
  deleteJobFileAction,
  deleteJobIssueAction,
  setJobChecklistAction,
  transitionJobAction,
  updateJobIssueAction,
} from "@/modules/field/field.actions";
import {
  FIELD_ACTION_LABEL,
  type FieldAction,
  type FieldJobDetail,
  type LocationInput,
  type PartOption,
} from "@/modules/field/field.schema";

/** One quick GPS reading for check-in/out; never blocks the action if it fails or is denied. */
function readLocation(): Promise<LocationInput | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 60_000 },
    );
  });
}

const ACTION_ICON: Record<FieldAction, typeof Truck> = {
  "on-my-way": Truck,
  start: PlayCircle,
  hold: PauseCircle,
  resume: PlayCircle,
  complete: CheckCircle2,
};

export function JobView({ job, parts }: { job: FieldJobDetail; parts: PartOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<FieldAction | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const refresh = () => router.refresh();

  const run = async (action: FieldAction, reason?: string) => {
    setBusy(action);
    const location = action === "on-my-way" ? null : await readLocation();
    const res = await transitionJobAction(job.id, { action, reason, location });
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success(
      {
        "on-my-way": "Dispatcher knows you are on the way.",
        start: "Work started.",
        hold: "Job put on hold.",
        resume: "Work resumed.",
        complete: "Job completed. Well done!",
      }[action],
    );
    setHoldOpen(false);
    refresh();
  };

  const primary: FieldAction | undefined =
    job.actions.find((a) => a === "complete" || a === "start" || a === "resume") ?? job.actions[0];
  const secondary = job.actions.filter((a) => a !== primary);
  const doneCount = job.checklist.filter((c) => c.isDone).length;

  return (
    <div className="space-y-4 pb-28">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground font-mono text-sm">{job.number}</span>
          <WorkOrderStatusBadge status={job.status} />
          <PriorityText priority={job.priority} />
        </div>
        <h1 className="text-xl leading-snug font-semibold">{job.title}</h1>
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <Clock className="size-4" /> {job.visit.day} · {job.visit.startTime}–{job.visit.endTime}
          {job.checkedInAt && (
            <span className="text-emerald-600">
              · on site since{" "}
              {new Date(job.checkedInAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </p>
      </div>

      {/* Customer and site */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div>
            <p className="font-medium">{job.customer.name}</p>
            {job.address && (
              <p className="text-muted-foreground mt-0.5 flex items-start gap-1.5 text-sm">
                <MapPin className="mt-0.5 size-4 shrink-0" />
                {job.address.label ? `${job.address.label} — ` : ""}
                {job.address.fullAddress}
              </p>
            )}
            {job.assetName && (
              <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-sm">
                <Wrench className="size-4 shrink-0" /> {job.assetName}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {job.address && (
              <Button asChild variant="outline">
                <a href={mapsUrl(job.address)} target="_blank" rel="noopener noreferrer">
                  <Navigation /> Navigate
                </a>
              </Button>
            )}
            {job.customer.phone && (
              <Button asChild variant="outline">
                <a href={`tel:${job.customer.phone}`}>
                  <Phone /> Call
                </a>
              </Button>
            )}
          </div>
          {job.description && <p className="border-t pt-3 text-sm whitespace-pre-wrap">{job.description}</p>}
        </CardContent>
      </Card>

      <Checklist job={job} done={doneCount} onChange={refresh} />
      <Parts job={job} parts={parts} onChange={refresh} />
      <EvidenceSection
        evidence={job.evidence}
        issues={job.issues}
        closed={job.closed}
        meId={job.meId}
        canDeleteAny={false}
        capture
        api={{
          uploadUrl: `/api/v1/field/jobs/${job.id}/attachments`,
          addIssue: (input) => addJobIssueAction(job.id, input),
          updateIssue: (issueId, input) => updateJobIssueAction(job.id, issueId, input),
          deleteIssue: (issueId) => deleteJobIssueAction(job.id, issueId),
          deleteFile: (attachmentId) => deleteJobFileAction(job.id, attachmentId),
        }}
      />
      <Photos job={job} onChange={refresh} />
      <Notes job={job} onChange={refresh} />

      {/* Sticky action bar above the bottom navigation */}
      {job.actions.length > 0 && (
        <div className="bg-background/95 fixed inset-x-0 bottom-[3.75rem] z-10 border-t p-3 backdrop-blur">
          <div className="mx-auto flex max-w-xl gap-2">
            {secondary.map((a) => {
              const Icon = ACTION_ICON[a];
              return (
                <Button
                  key={a}
                  variant="outline"
                  size="lg"
                  disabled={busy !== null}
                  onClick={() => (a === "hold" ? setHoldOpen(true) : run(a))}
                >
                  <Icon /> {FIELD_ACTION_LABEL[a]}
                </Button>
              );
            })}
            {primary && (
              <Button size="lg" className="flex-1" disabled={busy !== null} onClick={() => run(primary)}>
                {busy === primary ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  (() => {
                    const Icon = ACTION_ICON[primary];
                    return <Icon />;
                  })()
                )}
                {FIELD_ACTION_LABEL[primary]}
              </Button>
            )}
          </div>
        </div>
      )}

      <HoldDialog open={holdOpen} onOpenChange={setHoldOpen} busy={busy === "hold"} onConfirm={(r) => run("hold", r)} />
    </div>
  );
}

function HoldDialog({
  open,
  onOpenChange,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  busy: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Put this job on hold</DialogTitle>
          <DialogDescription>
            Tell the office why, for example waiting for a part or no access to the vehicle.
          </DialogDescription>
        </DialogHeader>
        <Field label="Reason" htmlFor="hold-reason" error={error}>
          <Textarea id="hold-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Back
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              reason.trim() ? (setError(""), onConfirm(reason.trim())) : setError("Please give a reason.")
            }
          >
            {busy && <Loader2 className="animate-spin" />} Put on hold
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof ListChecks;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4" /> {title}
          {hint && <span className="text-muted-foreground ml-auto text-sm font-normal">{hint}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function Checklist({ job, done, onChange }: { job: FieldJobDetail; done: number; onChange: () => void }) {
  const [pending, setPending] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, boolean>>({});
  useEffect(() => setLocal({}), [job.checklist]);

  const toggle = async (id: string, value: boolean) => {
    setLocal((l) => ({ ...l, [id]: value }));
    setPending(id);
    const res = await setJobChecklistAction(job.id, id, value);
    setPending(null);
    if (!res.ok) {
      setLocal((l) => ({ ...l, [id]: !value }));
      return void toast.error(res.error);
    }
    onChange();
  };

  if (job.checklist.length === 0) return null;
  const locked = job.closed;
  return (
    <Section icon={ListChecks} title="Checklist" hint={`${done}/${job.checklist.length}`}>
      {job.status !== "IN_PROGRESS" && !locked && (
        <p className="text-muted-foreground text-xs">
          Start work to tick items off. All items must be done to complete.
        </p>
      )}
      <ul className="space-y-1">
        {job.checklist.map((c) => {
          const checked = local[c.id] ?? c.isDone;
          return (
            <li key={c.id}>
              <label
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-1 py-1.5",
                  !locked && "active:bg-muted/50",
                )}
              >
                <Checkbox
                  checked={checked}
                  disabled={locked || pending === c.id}
                  onCheckedChange={(v) => toggle(c.id, v === true)}
                  className="size-5"
                />
                <span className={cn("text-sm leading-snug", checked && "text-muted-foreground line-through")}>
                  {c.text}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Parts({ job, parts, onChange }: { job: FieldJobDetail; parts: PartOption[]; onChange: () => void }) {
  const [partId, setPartId] = useState("");
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const n = Number(qty);
    if (!partId) return void toast.error("Choose a part.");
    if (!(n > 0)) return void toast.error("Enter a quantity.");
    setBusy(true);
    const res = await addJobPartAction(job.id, { serviceItemId: partId, qty: n });
    setBusy(false);
    if (!res.ok) return void toast.error(res.fieldErrors?.qty?.[0] ?? res.error);
    setPartId("");
    setQty("1");
    toast.success("Part added.");
    onChange();
  };

  return (
    <Section icon={Wrench} title="Services & parts">
      {job.parts.length === 0 && <p className="text-muted-foreground text-sm">No parts recorded yet.</p>}
      <ul className="divide-y text-sm">
        {job.parts.map((p) => (
          <li key={p.id} className="flex justify-between gap-3 py-2">
            <span>{p.description}</span>
            <span className="text-muted-foreground shrink-0">× {p.qty}</span>
          </li>
        ))}
      </ul>
      {!job.closed && parts.length > 0 && (
        <div className="grid grid-cols-[1fr_5rem_auto] items-end gap-2 border-t pt-3">
          <Field label="Add part" htmlFor="part">
            <NativeSelect id="part" value={partId} onChange={(e) => setPartId(e.target.value)}>
              <option value="">Choose…</option>
              {parts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.sku ? ` (${p.sku})` : ""}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Qty" htmlFor="part-qty">
            <Input id="part-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Button onClick={add} disabled={busy} aria-label="Add part">
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
          </Button>
        </div>
      )}
    </Section>
  );
}

async function upload(jobId: string, file: Blob, name: string, signature: boolean) {
  const body = new FormData();
  body.append("file", file, name);
  if (signature) body.append("kind", "SIGNATURE");
  const res = await fetch(`/api/v1/field/jobs/${jobId}/attachments`, { method: "POST", body });
  const json = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new Error(json.message ?? "Upload failed.");
}

function Photos({ job, onChange }: { job: FieldJobDetail; onChange: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [signing, setSigning] = useState(false);

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(files.length);
    let ok = 0;
    for (const f of Array.from(files)) {
      try {
        await upload(job.id, f, f.name, false);
        ok++;
      } catch (e) {
        toast.error(`${f.name}: ${(e as Error).message}`);
      }
      setUploading((n) => n - 1);
    }
    if (input.current) input.current.value = "";
    if (ok) {
      toast.success(`${ok} photo${ok === 1 ? "" : "s"} uploaded.`);
      onChange();
    }
  };

  const photos = job.photos.filter((p) => p.kind === "PHOTO");
  const sig = job.photos.find((p) => p.kind === "SIGNATURE");

  return (
    <Section icon={Camera} title="Photos & signature">
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.id}
              src={`/api/v1/attachments/${p.id}?inline=1`}
              alt={p.fileName}
              className="bg-muted aspect-square w-full rounded-md object-cover"
              loading="lazy"
            />
          ))}
        </div>
      )}
      {photos.length === 0 && <p className="text-muted-foreground text-sm">Any other photos of the job (optional).</p>}
      {!job.closed && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => addPhotos(e.target.files)}
          />
          <Button variant="outline" className="w-full" onClick={() => input.current?.click()} disabled={uploading > 0}>
            {uploading > 0 ? <Loader2 className="animate-spin" /> : <Camera />}
            {uploading > 0 ? `Uploading ${uploading}…` : "Take or add photo"}
          </Button>
        </>
      )}

      <div className="border-t pt-3">
        {sig ? (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
              <CheckCircle2 className="size-4" /> Customer signature captured
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/v1/attachments/${sig.id}?inline=1`}
              alt="Customer signature"
              className="h-24 rounded-md border bg-white"
            />
          </div>
        ) : (
          <p className="text-muted-foreground mb-2 text-sm">
            {job.requireSignature
              ? "A customer signature is required to complete this job."
              : "Customer signature (optional)."}
          </p>
        )}
        {!job.closed && (
          <Button variant="outline" className="mt-2 w-full" onClick={() => setSigning(true)}>
            <PenLine /> {sig ? "Capture again" : "Get customer signature"}
          </Button>
        )}
      </div>
      <SignatureDialog
        open={signing}
        onOpenChange={setSigning}
        onSave={async (blob) => {
          try {
            await upload(job.id, blob, "signature.png", true);
            toast.success("Signature saved.");
            setSigning(false);
            onChange();
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </Section>
  );
}

function SignatureDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (png: Blob) => Promise<void>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111111";
    }
    setEmpty(true);
  };

  useEffect(() => {
    if (open) {
      const t = setTimeout(reset, 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Customer signature</DialogTitle>
          <DialogDescription>Hand the phone to the customer and ask them to sign below.</DialogDescription>
        </DialogHeader>
        <canvas
          ref={canvas}
          width={600}
          height={260}
          className="w-full touch-none rounded-md border bg-white"
          onPointerDown={(e) => {
            const ctx = canvas.current?.getContext("2d");
            if (!ctx) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            const p = point(e);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + 0.1, p.y + 0.1);
            ctx.stroke();
            setEmpty(false);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = canvas.current?.getContext("2d");
            const p = point(e);
            ctx?.lineTo(p.x, p.y);
            ctx?.stroke();
          }}
          onPointerUp={() => (drawing.current = false)}
          onPointerCancel={() => (drawing.current = false)}
          aria-label="Signature area"
        />
        <DialogFooter>
          <Button variant="outline" onClick={reset}>
            Clear
          </Button>
          <Button
            disabled={empty || saving}
            onClick={() => {
              canvas.current?.toBlob(async (b) => {
                if (!b) return;
                setSaving(true);
                await onSave(b);
                setSaving(false);
              }, "image/png");
            }}
          >
            {saving && <Loader2 className="animate-spin" />} Save signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Notes({ job, onChange }: { job: FieldJobDetail; onChange: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const res = await addJobNoteAction(job.id, text);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    setText("");
    onChange();
  };

  return (
    <Section icon={MessageSquare} title="Notes">
      {job.notes.length === 0 && <p className="text-muted-foreground text-sm">No notes yet.</p>}
      <ul className="space-y-2">
        {job.notes.map((n) => (
          <li key={n.id} className="bg-muted/50 rounded-md p-2.5 text-sm">
            <p className="whitespace-pre-wrap">{n.text}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {n.author ?? "Office"} ·{" "}
              {new Date(n.createdAt).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </li>
        ))}
      </ul>
      {!job.closed && (
        <div className="space-y-2">
          <Textarea
            rows={2}
            placeholder="What did you find or do?"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button variant="outline" className="w-full" disabled={busy || !text.trim()} onClick={add}>
            {busy && <Loader2 className="animate-spin" />} Add note
          </Button>
        </div>
      )}
    </Section>
  );
}
