"use client";

import { Camera, Check, Loader2, RefreshCw, Square, SwitchCamera, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { canOpenCamera } from "@/components/domain/camera-capture";
import { Button } from "@/components/ui/button";
import {
  VIDEO_AUDIO_BITRATE,
  VIDEO_BITRATE,
  VIDEO_HEIGHT,
  VIDEO_MAX_SECONDS,
  VIDEO_WIDTH,
} from "@/modules/work-orders/evidence";

/** Whether this browser can record a video inside the page (it needs HTTPS or localhost). */
export const canRecordVideo = () => canOpenCamera() && typeof MediaRecorder !== "undefined";

/** MP4 plays everywhere (Safari, Chrome 126+); WebM is the fallback for other Chrome and Firefox. */
function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ].find((t) => MediaRecorder.isTypeSupported(t));
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const extOf = (type: string) => (type.includes("mp4") ? "mp4" : "webm");

/**
 * The app's own video recorder. It records at 720p and a fixed bit rate (about 12 MB a minute) and stops
 * by itself after 60 seconds, so a video can never be huge: a phone's camera app would make 60-100 MB.
 * The technician checks the clip, then "Use video" saves it (`onShot` returns whether it worked).
 */
export function VideoRecorder({
  open,
  onClose,
  title,
  onShot,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  onShot: (file: File) => Promise<boolean>;
}) {
  const live = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallback = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [attempt, setAttempt] = useState(0);
  const [cameras, setCameras] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState<{ blob: Blob; url: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const release = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  // Open the camera and microphone (again after a retake or a camera switch); release them when done.
  useEffect(() => {
    if (!open || clip) return;
    let cancelled = false;
    setReady(false);
    setError(null);
    (async () => {
      if (!canRecordVideo()) {
        setError("Video cannot be recorded here. Use your phone's camera app instead.");
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: VIDEO_WIDTH, max: VIDEO_WIDTH },
            height: { ideal: VIDEO_HEIGHT, max: VIDEO_WIDTH },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: true,
        });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (live.current) {
          live.current.srcObject = s;
          // Do not wait for playback to start: on some browsers that promise stays pending.
          void live.current.play().catch(() => undefined);
        }
        setReady(true);
        const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (!cancelled) setCameras(all.filter((d) => d.kind === "videoinput").length);
      } catch {
        if (!cancelled)
          setError(
            "The camera or microphone is blocked. Allow access for this site in the browser, or use your phone's camera app.",
          );
      }
    })();
    return () => {
      cancelled = true;
      release();
    };
  }, [open, facing, attempt, clip]);

  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close only reads refs and the latest clip
  }, [open, clip]);

  if (!open) return null;

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  };

  const start = () => {
    const s = stream.current;
    if (!s || recording) return;
    const mime = pickMime();
    const r = new MediaRecorder(s, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: VIDEO_BITRATE,
      audioBitsPerSecond: VIDEO_AUDIO_BITRATE,
    });
    recorder.current = r;
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
    r.onstop = () => {
      setRecording(false);
      const blob = new Blob(chunks.current, { type: r.mimeType || mime || "video/webm" });
      if (blob.size === 0) return void toast.error("Nothing was recorded. Try again.");
      setClip({ blob, url: URL.createObjectURL(blob) });
    };
    r.start(1000);
    setSeconds(0);
    setRecording(true);
    timer.current = setInterval(() => {
      setSeconds((n) => {
        if (n + 1 >= VIDEO_MAX_SECONDS) {
          stop();
          toast.message(`Stopped at ${VIDEO_MAX_SECONDS} seconds, the longest a video can be.`);
        }
        return n + 1;
      });
    }, 1000);
  };

  const retake = () => {
    if (clip) URL.revokeObjectURL(clip.url);
    setClip(null);
    setAttempt((n) => n + 1);
  };

  const use = async () => {
    if (!clip) return;
    setSaving(true);
    const type = clip.blob.type.split(";")[0] || "video/webm";
    const ok = await onShot(new File([clip.blob], `video-${Date.now()}.${extOf(type)}`, { type }));
    setSaving(false);
    if (ok) {
      URL.revokeObjectURL(clip.url);
      onClose();
    }
  };

  function close() {
    if (recorder.current && recorder.current.state !== "inactive") {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    release();
    if (clip) URL.revokeObjectURL(clip.url);
    onClose();
  }

  const mb = clip ? (clip.blob.size / 1024 / 1024).toFixed(1) : "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Video: ${title}`}
      className="fixed inset-0 z-[100] flex flex-col bg-black text-white"
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{title}</p>
        {recording && (
          <span className="flex items-center gap-1.5 text-xs tabular-nums">
            <span className="size-2 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
            {clock(seconds)} / {clock(VIDEO_MAX_SECONDS)}
          </span>
        )}
        <button
          type="button"
          onClick={close}
          aria-label="Close video recorder"
          className="rounded-full p-2 hover:bg-white/15"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <Video className="size-10 text-white/60" />
            <p className="max-w-xs text-sm text-white/80">{error}</p>
            <input
              ref={fallback}
              type="file"
              accept="video/*"
              capture="environment"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setSaving(true);
                const ok = await onShot(f);
                setSaving(false);
                if (ok) onClose();
              }}
            />
            <Button variant="secondary" onClick={() => fallback.current?.click()} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Camera />} Open phone camera
            </Button>
            <p className="max-w-xs text-xs text-white/60">Keep it under {VIDEO_MAX_SECONDS} seconds.</p>
          </div>
        ) : clip ? (
          <video src={clip.url} controls playsInline className="size-full object-contain" />
        ) : (
          <>
            <video ref={live} muted playsInline className="size-full object-contain" />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="size-8 animate-spin text-white/70" />
              </div>
            )}
          </>
        )}
      </div>

      {!error && (
        <div className="flex items-center justify-between gap-4 px-6 py-5">
          {clip ? (
            <>
              <Button variant="secondary" size="lg" onClick={retake} disabled={saving}>
                <RefreshCw /> Retake
              </Button>
              <span className="text-xs text-white/70 tabular-nums">{mb} MB</span>
              <Button size="lg" onClick={use} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Check />} Use video
              </Button>
            </>
          ) : (
            <>
              <div className="w-20" />
              {recording ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Stop recording"
                  className="flex size-[72px] items-center justify-center rounded-full border-4 border-white"
                >
                  <Square className="size-7 fill-red-500 text-red-500" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={start}
                  disabled={!ready}
                  aria-label="Start recording"
                  className="flex size-[72px] items-center justify-center rounded-full border-4 border-white disabled:opacity-50"
                >
                  <span className="size-14 rounded-full bg-red-500" />
                </button>
              )}
              <div className="flex w-20 justify-end">
                {cameras > 1 && !recording && (
                  <button
                    type="button"
                    onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                    aria-label="Switch camera"
                    className="rounded-full p-3 hover:bg-white/15"
                  >
                    <SwitchCamera className="size-6" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
