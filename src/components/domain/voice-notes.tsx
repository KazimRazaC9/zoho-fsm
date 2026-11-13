"use client";

import { Loader2, Mic, Send, Square, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { MAX_VOICE_NOTES, type VoiceNoteDto } from "@/modules/work-orders/work-orders.schema";

/** A recording stops by itself after this long, to keep files small. */
const MAX_SECONDS = 180;

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** The best audio format this browser can record (Chrome/Firefox: webm or ogg, Safari: mp4). */
function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
}

const extOf = (type: string) =>
  type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("mpeg") ? "mp3" : "weba";

type Mode = "idle" | "recording" | "review";

/**
 * Voice notes: record a spoken note, listen to it, then send. Recordings are stored on the work order
 * (up to 10) and everyone who can open the job can play them. Browsers without recording support
 * fall back to the phone's own voice recorder through a file picker.
 */
export function VoiceNotes({
  notes,
  uploadUrl,
  deleteFile,
  closed,
  meId,
  canDeleteAny,
}: {
  notes: VoiceNoteDto[];
  uploadUrl: string;
  deleteFile: (attachmentId: string) => Promise<ActionResult<unknown>>;
  closed: boolean;
  meId: string;
  canDeleteAny: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [canRecord, setCanRecord] = useState(true);

  useEffect(() => {
    setCanRecord(typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
    return () => {
      if (timer.current) clearInterval(timer.current);
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const full = notes.length >= MAX_VOICE_NOTES;

  const upload = async (blob: Blob, name: string) => {
    const type = blob.type.split(";")[0] || "audio/webm";
    const body = new FormData();
    body.append("file", new File([blob], name, { type }));
    const res = await fetch(uploadUrl, { method: "POST", body }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { message?: string } | undefined;
    if (!res?.ok) throw new Error(json?.message ?? "Upload failed. Check your connection and try again.");
  };

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  };

  const start = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const mime = pickMime();
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      recorder.current = r;
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      r.onstop = () => {
        s.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType || mime || "audio/webm" });
        if (blob.size === 0) {
          setMode("idle");
          return void toast.error("Nothing was recorded. Try again.");
        }
        setClip({ blob, url: URL.createObjectURL(blob) });
        setMode("review");
      };
      r.start();
      setSeconds(0);
      setMode("recording");
      timer.current = setInterval(() => {
        setSeconds((n) => {
          if (n + 1 >= MAX_SECONDS) stop();
          return n + 1;
        });
      }, 1000);
    } catch {
      toast.error("Microphone is blocked. Allow microphone access for this site in the browser, then try again.");
    }
  };

  const discard = () => {
    if (clip) URL.revokeObjectURL(clip.url);
    setClip(null);
    setMode("idle");
  };

  const send = async () => {
    if (!clip) return;
    setBusy(true);
    try {
      await upload(clip.blob, `voice-${Date.now()}.${extOf(clip.blob.type)}`);
      toast.success("Voice note added.");
      discard();
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  };

  const pickFile = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      await upload(f, f.name);
      toast.success("Voice note added.");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
    if (picker.current) picker.current.value = "";
    setBusy(false);
  };

  const remove = async (n: VoiceNoteDto) => {
    const res = await deleteFile(n.id);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Voice note removed.");
    router.refresh();
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Voice notes</p>
      {notes.length === 0 && <p className="text-muted-foreground text-sm">No voice notes yet.</p>}
      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.id} className="bg-muted/50 space-y-1.5 rounded-md p-2.5">
            <audio controls preload="none" src={`/api/v1/attachments/${n.id}?inline=1`} className="h-9 w-full" />
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs">
                {n.author ?? "Someone"} · {when(n.createdAt)}
              </p>
              {!closed && (canDeleteAny || n.authorId === meId) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Remove voice note"
                  onClick={() => remove(n)}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!closed && mode === "idle" && (
        <>
          <input
            ref={picker}
            type="file"
            accept="audio/*"
            capture
            className="hidden"
            onChange={(e) => pickFile(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy || full}
            onClick={() => (canRecord ? start() : picker.current?.click())}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Mic />}
            {full ? `Limit of ${MAX_VOICE_NOTES} voice notes reached` : "Record voice note"}
          </Button>
        </>
      )}

      {mode === "recording" && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-2.5">
          <span className="size-2.5 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
          <span className="text-sm font-medium tabular-nums" aria-live="off">
            Recording {clock(seconds)} / {clock(MAX_SECONDS)}
          </span>
          <Button type="button" size="sm" className="ml-auto" onClick={stop}>
            <Square /> Stop
          </Button>
        </div>
      )}

      {mode === "review" && clip && (
        <div className="space-y-2 rounded-md border p-2.5">
          <audio controls src={clip.url} className="h-9 w-full" />
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={discard} disabled={busy}>
              <X /> Discard
            </Button>
            <Button type="button" onClick={send} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />} Send
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
