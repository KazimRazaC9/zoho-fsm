"use client";

import { Camera, Loader2, Pencil, Plus, TriangleAlert, Trash2, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import {
  EVIDENCE_LIMITS,
  ISSUE_STATUS_LABEL,
  ISSUE_STATUSES,
  ISSUE_SUGGESTIONS,
  PHASE_LABEL,
  type EvidenceKind,
  type EvidencePhaseValue,
  type IssueStatusValue,
} from "@/modules/work-orders/evidence";
import type { EvidenceDto, IssueDto, IssueInput, MediaDto } from "@/modules/work-orders/work-orders.schema";

/** What the office and the technician app each plug in; the screen itself is the same. */
export type EvidenceApi = {
  /** Multipart upload endpoint (fields: file, phase, issueId). */
  uploadUrl: string;
  addIssue: (input: IssueInput) => Promise<ActionResult<unknown>>;
  updateIssue: (issueId: string, input: IssueInput) => Promise<ActionResult<unknown>>;
  deleteIssue: (issueId: string) => Promise<ActionResult<unknown>>;
  deleteFile: (attachmentId: string) => Promise<ActionResult<unknown>>;
};

type Common = {
  api: EvidenceApi;
  /** Work order is locked: show only. */
  closed: boolean;
  /** The signed-in user (a technician may remove only their own files). */
  meId: string;
  /** Office users may remove any file; the server still checks their permission. */
  canDeleteAny: boolean;
  /** On a phone, open the camera straight away. */
  capture: boolean;
};

const mediaUrl = (id: string) => `/api/v1/attachments/${id}?inline=1`;

/** Plain-language count: "2 of 4 photos · no video yet". */
function countText(items: MediaDto[]) {
  const photos = items.filter((m) => m.kind === "PHOTO").length;
  const videos = items.filter((m) => m.kind === "VIDEO").length;
  return `${photos}/${EVIDENCE_LIMITS.PHOTO} photos · ${videos}/${EVIDENCE_LIMITS.VIDEO} video`;
}

/** One slot: the Before or the After proof of the reported problem, or of one issue. */
function MediaSlot({
  phase,
  issueId,
  items,
  ...c
}: Common & { phase: EvidencePhaseValue; issueId?: string; items: MediaDto[] }) {
  const router = useRouter();
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const have = (k: EvidenceKind) => items.filter((m) => m.kind === k).length;

  const send = async (files: FileList | null, kind: EvidenceKind) => {
    if (!files?.length) return;
    const room = EVIDENCE_LIMITS[kind] - have(kind);
    const list = Array.from(files);
    if (list.length > room)
      toast.error(
        room > 0
          ? `Only ${room} more ${kind === "PHOTO" ? "photo" : "video"} fits here; the rest were skipped.`
          : `This section is full. Remove one first.`,
      );
    setBusy(true);
    let ok = 0;
    for (const file of list.slice(0, Math.max(0, room))) {
      const body = new FormData();
      body.append("file", file);
      body.append("phase", phase);
      if (issueId) body.append("issueId", issueId);
      const res = await fetch(c.api.uploadUrl, { method: "POST", body }).catch(() => null);
      const json = (await res?.json().catch(() => ({}))) as { message?: string } | undefined;
      if (res?.ok) ok++;
      else toast.error(`${file.name}: ${json?.message ?? "upload failed. Check your connection and try again."}`);
    }
    setBusy(false);
    for (const ref of [photoInput, videoInput]) if (ref.current) ref.current.value = "";
    if (ok) {
      toast.success(`${ok} file${ok === 1 ? "" : "s"} uploaded.`);
      router.refresh();
    }
  };

  const remove = async (m: MediaDto) => {
    const res = await c.api.deleteFile(m.id);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Removed.");
    router.refresh();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium">{PHASE_LABEL[phase]}</h4>
        <span className="text-muted-foreground text-xs">{countText(items)}</span>
      </div>
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {items.map((m) => (
            <figure key={m.id} className="relative overflow-hidden rounded-md border">
              {m.kind === "VIDEO" ? (
                <video
                  src={mediaUrl(m.id)}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-square w-full bg-black object-contain"
                />
              ) : (
                <a href={mediaUrl(m.id)} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API URL, not optimisable */}
                  <img
                    src={mediaUrl(m.id)}
                    alt={`${PHASE_LABEL[phase]} photo`}
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                </a>
              )}
              {!c.closed && (c.canDeleteAny || m.authorId === c.meId) && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute top-1 right-1 size-7"
                  aria-label={`Remove ${m.kind === "VIDEO" ? "video" : "photo"}`}
                  onClick={() => remove(m)}
                >
                  <Trash2 />
                </Button>
              )}
            </figure>
          ))}
        </div>
      )}
      {items.length === 0 && <p className="text-muted-foreground text-xs">Nothing added yet.</p>}
      {!c.closed && (
        <div className="grid grid-cols-2 gap-2">
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            multiple
            {...(c.capture ? { capture: "environment" as const } : {})}
            className="hidden"
            onChange={(e) => send(e.target.files, "PHOTO")}
          />
          <input
            ref={videoInput}
            type="file"
            accept="video/*"
            {...(c.capture ? { capture: "environment" as const } : {})}
            className="hidden"
            onChange={(e) => send(e.target.files, "VIDEO")}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || have("PHOTO") >= EVIDENCE_LIMITS.PHOTO}
            onClick={() => photoInput.current?.click()}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Camera />} Photo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || have("VIDEO") >= EVIDENCE_LIMITS.VIDEO}
            onClick={() => videoInput.current?.click()}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Video />} Video
          </Button>
        </div>
      )}
    </div>
  );
}

function BeforeAfter({ evidence, issueId, ...c }: Common & { evidence: EvidenceDto; issueId?: string }) {
  return (
    <div className="@container">
      <div className="grid gap-4 @md:grid-cols-2">
        <MediaSlot phase="BEFORE" issueId={issueId} items={evidence.before} {...c} />
        <MediaSlot phase="AFTER" issueId={issueId} items={evidence.after} {...c} />
      </div>
    </div>
  );
}

const OTHER = "__other__";

function IssueDialog({
  open,
  onOpenChange,
  issue,
  api,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  issue?: IssueDto;
  api: EvidenceApi;
}) {
  const router = useRouter();
  const known = issue ? (ISSUE_SUGGESTIONS as readonly string[]).includes(issue.title) : true;
  const [pick, setPick] = useState<string>(issue ? (known ? issue.title : OTHER) : ISSUE_SUGGESTIONS[0]);
  const [custom, setCustom] = useState(issue && !known ? issue.title : "");
  const [details, setDetails] = useState(issue?.details ?? "");
  const [status, setStatus] = useState<IssueStatusValue>(issue?.status ?? "FOUND");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title = pick === OTHER ? custom.trim() : pick;

  const save = async () => {
    if (!title) return setError("Write what the issue is.");
    setError(null);
    setBusy(true);
    const input: IssueInput = { title, details, status };
    const res = issue ? await api.updateIssue(issue.id, input) : await api.addIssue(input);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success(issue ? "Issue saved." : "Issue added. Now add its photos.");
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{issue ? "Edit issue" : "Another issue found"}</DialogTitle>
          <DialogDescription>
            Something you found on site besides the reported problem. Add its photos after saving.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="What is it?" htmlFor="is-pick">
            <NativeSelect id="is-pick" value={pick} onChange={(e) => setPick(e.target.value)}>
              {ISSUE_SUGGESTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={OTHER}>Other (write it yourself)</option>
            </NativeSelect>
          </Field>
          {pick === OTHER && (
            <Field label="Describe the issue" htmlFor="is-custom">
              <Input
                id="is-custom"
                maxLength={120}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="e.g. Rear camera cable cut"
              />
            </Field>
          )}
          <Field label="Details" htmlFor="is-details" hint="Optional">
            <Textarea id="is-details" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
          </Field>
          <Field label="Status" htmlFor="is-status">
            <NativeSelect id="is-status" value={status} onChange={(e) => setStatus(e.target.value as IssueStatusValue)}>
              {ISSUE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ISSUE_STATUS_LABEL[s]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} {issue ? "Save" : "Add issue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssueCard({ issue, ...c }: Common & { issue: IssueDto }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const setStatus = async (status: IssueStatusValue) => {
    const res = await c.api.updateIssue(issue.id, { title: issue.title, details: issue.details ?? "", status });
    if (!res.ok) return void toast.error(res.error);
    router.refresh();
  };
  const remove = async () => {
    if (!window.confirm(`Remove "${issue.title}" and its photos?`)) return;
    const res = await c.api.deleteIssue(issue.id);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Issue removed.");
    router.refresh();
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{issue.title}</p>
          {issue.details && <p className="text-muted-foreground text-sm whitespace-pre-wrap">{issue.details}</p>}
          {issue.author && <p className="text-muted-foreground text-xs">Found by {issue.author}</p>}
        </div>
        {c.closed ? (
          <span className="text-muted-foreground text-xs">{ISSUE_STATUS_LABEL[issue.status]}</span>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <NativeSelect
              aria-label="Issue status"
              className="h-8 w-auto text-xs"
              value={issue.status}
              onChange={(e) => setStatus(e.target.value as IssueStatusValue)}
            >
              {ISSUE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ISSUE_STATUS_LABEL[s]}
                </option>
              ))}
            </NativeSelect>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Edit issue"
              onClick={() => setEditing(true)}
            >
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Remove issue" onClick={remove}>
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
      <BeforeAfter evidence={issue.evidence} issueId={issue.id} {...c} />
      {editing && <IssueDialog open onOpenChange={setEditing} issue={issue} api={c.api} />}
    </div>
  );
}

/**
 * Proof for a work order: Before / After photos and video of the reported problem, and a list of
 * other issues found on site, each with its own Before / After proof.
 */
export function EvidenceSection({
  evidence,
  issues,
  api,
  closed,
  meId,
  canDeleteAny,
  capture = false,
}: {
  evidence: EvidenceDto;
  issues: IssueDto[];
  api: EvidenceApi;
  closed: boolean;
  meId: string;
  canDeleteAny: boolean;
  capture?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const c: Common = { api, closed, meId, canDeleteAny, capture };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="size-4" /> Reported problem: before and after
          </CardTitle>
          <p className="text-muted-foreground text-xs">Up to 4 photos and 1 video each, before and after the work.</p>
        </CardHeader>
        <CardContent>
          <BeforeAfter evidence={evidence} {...c} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <TriangleAlert className="size-4" /> Other issues found ({issues.length})
            </CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              Problems found on site besides the reported one. Each has its own before and after proof.
            </p>
          </div>
          {!closed && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus /> Add issue
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {issues.length === 0 && <p className="text-muted-foreground text-sm">No other issues recorded.</p>}
          {issues.map((i) => (
            <IssueCard key={i.id} issue={i} {...c} />
          ))}
        </CardContent>
      </Card>
      {adding && <IssueDialog open onOpenChange={setAdding} api={api} />}
    </>
  );
}
