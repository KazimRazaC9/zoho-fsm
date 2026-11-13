"use client";

import { Camera, Check, Loader2, RefreshCw, SwitchCamera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Photos are taken at no more than this many pixels on the long side and 90% quality. The server then
 * compresses every photo again (1920 px, JPEG 80), so this only keeps the upload small.
 */
const MAX_EDGE = 1920;
const QUALITY = 0.9;

/** Whether this browser can open the camera inside the page (it needs HTTPS or localhost). */
export const canOpenCamera = () =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;

/**
 * The app's own camera: opens the phone's camera inside the page, so the technician takes photos
 * label by label without leaving the app and the picture quality is controlled here.
 *  - "single": take one photo, check it, then "Use photo" (or "Retake"). Used for a labeled box.
 *  - "multi": every shot is saved at once and the camera stays open for the next one. Used for
 *    "Other photos"; it closes by itself when `room` photos have been taken.
 * `onShot` saves the file and returns whether it worked.
 */
export function CameraCapture({
  open,
  onClose,
  title,
  mode,
  room,
  onShot,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  mode: "single" | "multi";
  room?: number;
  onShot: (file: File) => Promise<boolean>;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const fallback = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [cameras, setCameras] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(0);
  const [flash, setFlash] = useState(false);

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  // Start (and restart when the camera is switched) while open; always release the camera when closed.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReady(false);
    setError(null);
    setShot(null);
    (async () => {
      if (!canOpenCamera()) {
        setError("The camera cannot open here. Use your phone's camera app instead.");
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          // Do not wait for playback to start: on some browsers that promise stays pending.
          void video.current.play().catch(() => undefined);
        }
        setReady(true);
        const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (!cancelled) setCameras(all.filter((d) => d.kind === "videoinput").length);
      } catch {
        if (!cancelled)
          setError(
            "The camera is blocked. Allow camera access for this site in the browser, or use your phone's camera app.",
          );
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, facing]);

  // Reset the counters for each new session, keep the page still while the camera is on screen.
  useEffect(() => {
    if (!open) return;
    setSaved(0);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const save = async (blob: Blob, name = `photo-${Date.now()}.jpg`) => {
    setSaving(true);
    const ok = await onShot(new File([blob], name, { type: blob.type || "image/jpeg" }));
    setSaving(false);
    return ok;
  };

  const take = async () => {
    const v = video.current;
    if (!v || !v.videoWidth || saving) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", QUALITY));
    if (!blob) return void toast.error("Could not take the photo. Try again.");
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    if (mode === "single") return setShot({ blob, url: URL.createObjectURL(blob) });
    // multi: save now and keep shooting.
    if (await save(blob)) {
      const n = saved + 1;
      setSaved(n);
      if (room !== undefined && n >= room) {
        toast.success("That was the last photo that fits.");
        onClose();
      }
    }
  };

  const retake = () => {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
  };

  const use = async () => {
    if (!shot) return;
    if (await save(shot.blob)) {
      URL.revokeObjectURL(shot.url);
      onClose();
    }
  };

  const close = () => {
    if (shot) URL.revokeObjectURL(shot.url);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Camera: ${title}`}
      className="fixed inset-0 z-[100] flex flex-col bg-black text-white"
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{title}</p>
        {mode === "multi" && <span className="text-xs text-white/70 tabular-nums">{saved} saved</span>}
        <button type="button" onClick={close} aria-label="Close camera" className="rounded-full p-2 hover:bg-white/15">
          <X className="size-5" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <Camera className="size-10 text-white/60" />
            <p className="max-w-xs text-sm text-white/80">{error}</p>
            <input
              ref={fallback}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (e.target) e.target.value = "";
                if (f && (await save(f, f.name)) && mode === "single") onClose();
              }}
            />
            <Button variant="secondary" onClick={() => fallback.current?.click()} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Camera />} Open phone camera
            </Button>
          </div>
        ) : (
          <>
            {/* The live picture; hidden behind the photo while it is being checked. */}
            <video
              ref={video}
              muted
              playsInline
              className={shot ? "invisible absolute inset-0 size-full object-contain" : "size-full object-contain"}
            />
            {shot && (
              // eslint-disable-next-line @next/next/no-img-element -- a local blob preview
              <img src={shot.url} alt="Photo just taken" className="absolute inset-0 size-full object-contain" />
            )}
            {!ready && !shot && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="size-8 animate-spin text-white/70" />
              </div>
            )}
            {flash && <div className="absolute inset-0 bg-white/80" />}
          </>
        )}
      </div>

      {!error && (
        <div className="flex items-center justify-between gap-4 px-6 py-5">
          {shot ? (
            <>
              <Button variant="secondary" size="lg" onClick={retake} disabled={saving}>
                <RefreshCw /> Retake
              </Button>
              <Button size="lg" onClick={use} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Check />} Use photo
              </Button>
            </>
          ) : (
            <>
              <div className="w-20 text-left">
                {mode === "multi" && (
                  <Button variant="secondary" size="sm" onClick={close}>
                    Done
                  </Button>
                )}
              </div>
              <button
                type="button"
                onClick={take}
                disabled={!ready || saving}
                aria-label="Take photo"
                className="flex size-[72px] items-center justify-center rounded-full border-4 border-white disabled:opacity-50"
              >
                <span className="flex size-14 items-center justify-center rounded-full bg-white">
                  {saving && <Loader2 className="size-6 animate-spin text-black" />}
                </span>
              </button>
              <div className="flex w-20 justify-end">
                {cameras > 1 && (
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
