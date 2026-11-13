"use client";

import { Camera, Loader2, Pencil, Play, Plus, RefreshCw, TriangleAlert, Trash2, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Field, NativeSelect } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { CameraCapture, canOpenCamera } from "@/components/domain/camera-capture";
import { canRecordVideo, VideoRecorder } from "@/components/domain/video-recorder";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import {
  EVIDENCE_LIMITS,
  OTHER_PHOTO_LIMIT,
  ISSUE_STATUS_LABEL,
  ISSUE_STATUSES,
  ISSUE_SUGGESTIONS,
  PHASE_LABEL,
  slotsFor,
  VIDEO_MAX_SECONDS,
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
  /** The "Temperature sensor installed" switch. */
  setTempSensor: (on: boolean) => Promise<ActionResult<unknown>>;
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
/** The small preview made on upload (the full file when there is none). Used in grids; a tap opens the full photo. */
const thumbUrl = (id: string) => `/api/v1/attachments/${id}?inline=1&thumb=1`;

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
  items: all,
  videoOnly = false,
  ...c
}: Common & { phase: EvidencePhaseValue; issueId?: string; items: MediaDto[]; videoOnly?: boolean }) {
  const router = useRouter();
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // In video-only mode (the reported problem's labeled photos live elsewhere) only videos show here.
  const items = videoOnly ? all.filter((m) => m.kind === "VIDEO") : all;
  const have = (k: EvidenceKind) => items.filter((m) => m.kind === k).length;
  const [cam, setCam] = useState(false);
  const [rec, setRec] = useState(false);
  const [cameraOk, setCameraOk] = useState(false);
  useEffect(() => setCameraOk(canOpenCamera()), []);
  const takePhoto = async (file: File): Promise<boolean> => {
    const body = new FormData();
    body.append("file", file);
    body.append("phase", phase);
    if (issueId) body.append("issueId", issueId);
    const res = await fetch(c.api.uploadUrl, { method: "POST", body }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { message?: string } | undefined;
    if (!res?.ok) {
      toast.error(`${json?.message ?? "upload failed. Check your connection and try again."}`);
      return false;
    }
    router.refresh();
    return true;
  };

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
      {rec && (
        <VideoRecorder open title={`${PHASE_LABEL[phase]} video`} onClose={() => setRec(false)} onShot={takePhoto} />
      )}
      {cam && (
        <CameraCapture
          open
          mode="multi"
          title={`${PHASE_LABEL[phase]} photos`}
          room={Math.max(0, EVIDENCE_LIMITS.PHOTO - have("PHOTO"))}
          onClose={() => setCam(false)}
          onShot={takePhoto}
        />
      )}
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium">{videoOnly ? `${PHASE_LABEL[phase]} video` : PHASE_LABEL[phase]}</h4>
        <span className="text-muted-foreground text-xs">
          {videoOnly ? `${have("VIDEO")}/${EVIDENCE_LIMITS.VIDEO} video` : countText(items)}
        </span>
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
                    src={thumbUrl(m.id)}
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
        <div className={videoOnly ? "grid grid-cols-1 gap-2" : "grid grid-cols-2 gap-2"}>
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
          {!videoOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || have("PHOTO") >= EVIDENCE_LIMITS.PHOTO}
              onClick={() => (c.capture && cameraOk ? setCam(true) : photoInput.current?.click())}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Camera />} Photo
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || have("VIDEO") >= EVIDENCE_LIMITS.VIDEO}
            onClick={() => (c.capture && canRecordVideo() ? setRec(true) : videoInput.current?.click())}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Video />} Video
          </Button>
        </div>
      )}
    </div>
  );
}

const CELL = "size-[4.5rem]";
const ROW = "grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-x-3 sm:gap-x-5";

/**
 * One small box in the table: empty (tap to add), or the photo / video with a slim Retake and Remove bar.
 * A labeled box holds ONE photo; taking it again replaces the old one.
 */
function SlotCell({
  label,
  slot,
  phase,
  item,
  kind = "PHOTO",
  ...c
}: Common & {
  label: string;
  slot?: string;
  phase: EvidencePhaseValue;
  item?: MediaDto;
  kind?: "PHOTO" | "VIDEO";
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const name = `${label} ${PHASE_LABEL[phase].toLowerCase()}`;
  const Icon = kind === "VIDEO" ? Video : Camera;

  const upload = async (file: File): Promise<boolean> => {
    setBusy(true);
    const body = new FormData();
    body.append("file", file);
    body.append("phase", phase);
    if (slot) body.append("slot", slot);
    const res = await fetch(c.api.uploadUrl, { method: "POST", body }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { message?: string } | undefined;
    setBusy(false);
    if (!res?.ok) {
      toast.error(`${name}: ${json?.message ?? "upload failed. Check your connection and try again."}`);
      return false;
    }
    toast.success(`${name} saved.`);
    router.refresh();
    return true;
  };

  const send = async (files: FileList | null) => {
    const file = files?.[0];
    if (file) await upload(file);
    if (input.current) input.current.value = "";
  };

  // A technician takes the photo in the app's own camera; the office picks a file.
  const [cam, setCam] = useState(false);
  const [rec, setRec] = useState(false);
  const pick = () => {
    if (c.capture && kind === "PHOTO" && canOpenCamera()) return setCam(true);
    if (c.capture && kind === "VIDEO" && canRecordVideo()) return setRec(true);
    input.current?.click();
  };

  const remove = async () => {
    if (!item) return;
    const res = await c.api.deleteFile(item.id);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Removed.");
    router.refresh();
  };

  const bar = "flex size-6 items-center justify-center rounded text-white hover:bg-white/25 disabled:opacity-60";

  return (
    <div className="flex justify-center">
      {item ? (
        <div className={cn(CELL, "relative overflow-hidden rounded-md border")}>
          <a
            href={mediaUrl(item.id)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${name}`}
            className="block size-full"
          >
            {kind === "VIDEO" ? (
              <>
                <video
                  src={mediaUrl(item.id)}
                  muted
                  playsInline
                  preload="metadata"
                  className="size-full object-cover"
                />
                <Play className="absolute inset-0 m-auto size-5 text-white drop-shadow" />
              </>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- authenticated API URL, not optimisable
              <img src={thumbUrl(item.id)} alt={name} className="size-full object-cover" loading="lazy" />
            )}
          </a>
          {!c.closed && (
            <div className="absolute inset-x-0 bottom-0 flex justify-end gap-0.5 bg-black/55 px-0.5">
              <button type="button" className={bar} aria-label={`Retake ${name}`} disabled={busy} onClick={pick}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              </button>
              {(c.canDeleteAny || item.authorId === c.meId) && (
                <button type="button" className={bar} aria-label={`Remove ${name}`} onClick={remove}>
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      ) : c.closed ? (
        <div className={cn(CELL, "rounded-md border border-dashed")} aria-label={`No ${name}`} />
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={pick}
          aria-label={`Add ${name}`}
          className={cn(
            CELL,
            "text-muted-foreground hover:bg-muted/60 flex items-center justify-center rounded-md border border-dashed disabled:opacity-60",
          )}
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
        </button>
      )}
      {cam && <CameraCapture open mode="single" title={name} onClose={() => setCam(false)} onShot={upload} />}
      {rec && <VideoRecorder open title={name} onClose={() => setRec(false)} onShot={upload} />}
      <input
        ref={input}
        type="file"
        accept={kind === "VIDEO" ? "video/*" : "image/*"}
        {...(c.capture ? { capture: "environment" as const } : {})}
        className="hidden"
        onChange={(e) => send(e.target.files)}
      />
    </div>
  );
}

/** A photo kept under "Other photos". */
export type OtherPhoto = { id: string; fileName: string; authorId: string | null };

/**
 * "Other photos": anything else worth showing, up to 15 in total. Several can be picked at once.
 */
function OtherPhotos({ photos, ...c }: Common & { photos: OtherPhoto[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [cam, setCam] = useState<{ room: number } | null>(null);
  const [cameraOk, setCameraOk] = useState(false);
  useEffect(() => setCameraOk(canOpenCamera()), []);
  const full = photos.length >= OTHER_PHOTO_LIMIT;
  const inApp = c.capture && cameraOk;

  /** Uploads one photo; returns whether it was saved. */
  const uploadOne = async (file: File): Promise<boolean> => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(c.api.uploadUrl, { method: "POST", body }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { message?: string } | undefined;
    if (res?.ok) return true;
    toast.error(`${file.name}: ${json?.message ?? "upload failed. Check your connection and try again."}`);
    return false;
  };

  const send = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = Math.max(0, OTHER_PHOTO_LIMIT - photos.length);
    const list = Array.from(files).slice(0, room);
    if (list.length < files.length)
      toast.error(
        room > 0
          ? `Only ${room} more photo${room === 1 ? "" : "s"} fit${room === 1 ? "s" : ""}; the rest were skipped.`
          : "This section is full. Remove a photo first.",
      );
    if (list.length === 0) return;
    setBusy(list.length);
    let ok = 0;
    for (const file of list) {
      if (await uploadOne(file)) ok++;
      setBusy((n) => n - 1);
    }
    if (input.current) input.current.value = "";
    if (ok) {
      toast.success(`${ok} photo${ok === 1 ? "" : "s"} added.`);
      router.refresh();
    }
  };

  const remove = async (p: OtherPhoto) => {
    const res = await c.api.deleteFile(p.id);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Removed.");
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium">Other photos</h4>
        <span className="text-muted-foreground text-xs tabular-nums">
          {photos.length}/{OTHER_PHOTO_LIMIT}
        </span>
      </div>
      {photos.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {photos.map((p) => (
            <div key={p.id} className="relative aspect-square overflow-hidden rounded-md border">
              <a href={mediaUrl(p.id)} target="_blank" rel="noreferrer" aria-label={`Open ${p.fileName}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API URL, not optimisable */}
                <img src={thumbUrl(p.id)} alt={p.fileName} className="size-full object-cover" loading="lazy" />
              </a>
              {!c.closed && (c.canDeleteAny || p.authorId === c.meId) && (
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => remove(p)}
                  className="absolute top-0.5 right-0.5 flex size-6 items-center justify-center rounded bg-black/55 text-white hover:bg-black/75"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!c.closed && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            {...(c.capture ? { capture: "environment" as const } : {})}
            className="hidden"
            onChange={(e) => send(e.target.files)}
          />
          <div className={inApp ? "grid grid-cols-2 gap-2" : undefined}>
            {inApp && (
              <Button
                type="button"
                size="sm"
                disabled={busy > 0 || full}
                onClick={() => setCam({ room: OTHER_PHOTO_LIMIT - photos.length })}
              >
                <Camera /> Open camera
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={busy > 0 || full}
              onClick={() => input.current?.click()}
            >
              {busy > 0 ? <Loader2 className="animate-spin" /> : <Camera />}
              {busy > 0
                ? `Uploading ${busy}…`
                : full
                  ? `Limit of ${OTHER_PHOTO_LIMIT} photos reached`
                  : inApp
                    ? "From gallery"
                    : photos.length === 0
                      ? "Add photos"
                      : "Add more photos"}
            </Button>
          </div>
          {cam && (
            <CameraCapture
              open
              mode="multi"
              title="Other photos"
              room={cam.room}
              onClose={() => setCam(null)}
              onShot={async (file) => {
                const ok = await uploadOne(file);
                if (ok) router.refresh();
                return ok;
              }}
            />
          )}
        </>
      )}
      {c.closed && photos.length === 0 && <p className="text-muted-foreground text-xs">No other photos.</p>}
    </div>
  );
}

/**
 * The reported problem's photos as one tidy table: a row for every label, a box under Before and one
 * under After, then the optional video. Counts above each column show what is still missing.
 */
function LabeledPhotos({ evidence, hasTempSensor, ...c }: Common & { evidence: EvidenceDto; hasTempSensor: boolean }) {
  const wanted = slotsFor(hasTempSensor);
  const phases = [
    ["BEFORE", evidence.before],
    ["AFTER", evidence.after],
  ] as const;
  const done = (items: MediaDto[]) => wanted.filter((s) => items.some((m) => m.slot === s.key)).length;
  return (
    <div>
      <div className={cn(ROW, "pb-2")}>
        <span />
        {phases.map(([phase, items]) => (
          <div key={phase} className="text-center">
            <p className="text-sm font-medium">{PHASE_LABEL[phase]}</p>
            <p
              className={cn(
                "text-xs tabular-nums",
                done(items) === wanted.length ? "text-emerald-600" : "text-muted-foreground",
              )}
            >
              {done(items)}/{wanted.length}
            </p>
          </div>
        ))}
      </div>
      <div className="divide-y border-y">
        {wanted.map((s) => (
          <div key={s.key} className={cn(ROW, "py-2")}>
            <span className="text-sm">{s.label}</span>
            {phases.map(([phase, items]) => (
              <SlotCell
                key={phase}
                label={s.label}
                slot={s.key}
                phase={phase}
                item={items.find((m) => m.slot === s.key)}
                {...c}
              />
            ))}
          </div>
        ))}
        <div className={cn(ROW, "py-2")}>
          <span className="text-sm">
            Video <span className="text-muted-foreground">(optional, up to {VIDEO_MAX_SECONDS} s)</span>
          </span>
          {phases.map(([phase, items]) => (
            <SlotCell
              key={phase}
              label="Video"
              phase={phase}
              kind="VIDEO"
              item={items.find((m) => m.kind === "VIDEO")}
              {...c}
            />
          ))}
        </div>
      </div>
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
  hasTempSensor,
  otherPhotos,
  capture = false,
}: {
  evidence: EvidenceDto;
  issues: IssueDto[];
  api: EvidenceApi;
  closed: boolean;
  meId: string;
  canDeleteAny: boolean;
  hasTempSensor: boolean;
  /** Ordinary photos of the job (not before/after proof). */
  otherPhotos: OtherPhoto[];
  capture?: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [tempBusy, setTempBusy] = useState(false);
  const c: Common = { api, closed, meId, canDeleteAny, capture };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="size-4" /> Reported problem: before and after
          </CardTitle>
          <p className="text-muted-foreground text-xs">Tap a box to add a photo. Retake replaces it.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/40 flex items-center gap-3 rounded-md px-3 py-2">
            <Switch
              id="temp-sensor"
              checked={hasTempSensor}
              disabled={closed || tempBusy}
              onCheckedChange={async (on) => {
                setTempBusy(true);
                const res = await api.setTempSensor(on);
                setTempBusy(false);
                if (!res.ok) return void toast.error(res.error);
                router.refresh();
              }}
            />
            <Label htmlFor="temp-sensor" className="flex-1 text-sm font-normal">
              Temperature sensor installed
            </Label>
            <span className="text-muted-foreground hidden text-xs sm:inline">adds 2 photos</span>
          </div>
          <LabeledPhotos evidence={evidence} hasTempSensor={hasTempSensor} {...c} />
          <div className="border-t pt-4">
            <OtherPhotos photos={otherPhotos} {...c} />
          </div>
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
