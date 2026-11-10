"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, MapPinOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { recordLocationAction } from "@/modules/field/field.actions";

const KEY = "fs.shareLocation";
const EVERY_MS = 60_000;

/** Registers the service worker (production only) so the field app is installable and opens offline. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

const readSetting = () => {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
};

/**
 * Header toggle + background reporting: while the app is open and visible and sharing is on,
 * the phone's position is sent every minute so the dispatcher's live map stays current.
 */
export function LocationSharing() {
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  const warned = useRef(false);

  useEffect(() => {
    setOn(readSetting());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!on || typeof navigator === "undefined" || !navigator.geolocation) return;
    const send = () => {
      if (document.visibilityState !== "visible") return;
      navigator.geolocation.getCurrentPosition(
        (p) =>
          void recordLocationAction({
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracy: p.coords.accuracy,
            speed: p.coords.speed != null && p.coords.speed >= 0 ? p.coords.speed : null,
            heading: p.coords.heading != null && !Number.isNaN(p.coords.heading) ? p.coords.heading : null,
          }),
        (err) => {
          if (err.code === err.PERMISSION_DENIED && !warned.current) {
            warned.current = true;
            toast.error("Location is blocked in your browser, so the dispatcher cannot see you on the map.");
          }
        },
        { enableHighAccuracy: false, timeout: 15_000, maximumAge: 30_000 },
      );
    };
    send();
    const t = setInterval(send, EVERY_MS);
    document.addEventListener("visibilitychange", send);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", send);
    };
  }, [on]);

  if (!ready) return null;
  const toggle = () => {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(KEY, next ? "on" : "off");
    } catch {
      /* private mode: the setting just won't persist */
    }
    toast(next ? "Sharing your location with the dispatcher." : "Location sharing is off.");
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Location sharing on. Tap to turn off." : "Location sharing off. Tap to turn on."}
      className={on ? "text-emerald-600" : "text-muted-foreground"}
    >
      {on ? <MapPin /> : <MapPinOff />}
    </Button>
  );
}
