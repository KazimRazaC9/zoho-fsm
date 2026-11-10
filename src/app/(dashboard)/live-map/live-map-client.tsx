"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { LiveTechnician } from "@/modules/field/field.schema";

// Leaflet touches `window` when imported, so the map only loads in the browser.
const TechniciansMap = dynamic(() => import("@/components/maps/tech-map").then((m) => m.TechniciansMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-md" />,
});

const STALE_MIN = 15;

const ago = (iso: string, now: number) => {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ago` : "yesterday";
};

export function LiveMap({ technicians }: { technicians: LiveTechnician[] }) {
  const router = useRouter();
  const [focus, setFocus] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Refresh the positions every 30 seconds while the page is open.
  useEffect(() => {
    const t = setInterval(() => {
      router.refresh();
      setNow(Date.now());
    }, 30_000);
    return () => clearInterval(t);
  }, [router]);

  const located = technicians.filter((t) => t.location);
  const pins = located.map((t) => ({
    id: t.id,
    lat: t.location!.latitude,
    lng: t.location!.longitude,
    label: t.name,
    color: t.color,
    stale: now - new Date(t.location!.recordedAt).getTime() > STALE_MIN * 60_000,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Card className="h-fit gap-0 py-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <h2 className="text-sm font-semibold">Technicians</h2>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Refresh now"
            onClick={() => {
              router.refresh();
              setNow(Date.now());
            }}
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
        <ul className="divide-y">
          {technicians.length === 0 && (
            <li className="text-muted-foreground p-6 text-center text-sm">No active technicians yet.</li>
          )}
          {technicians.map((t) => {
            const stale = t.location ? now - new Date(t.location.recordedAt).getTime() > STALE_MIN * 60_000 : true;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={!t.location}
                  onClick={() => setFocus(t.id)}
                  className={cn(
                    "hover:bg-muted/50 w-full px-3 py-2.5 text-left disabled:cursor-default disabled:hover:bg-transparent",
                    focus === t.id && "bg-muted",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
                    <span className="truncate text-sm font-medium">{t.name}</span>
                    {t.job && (
                      <Badge variant="outline" className="ml-auto shrink-0">
                        {t.job.status === "ON_SITE" ? "On site" : "En route"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-0.5 pl-4.5 text-xs">
                    {t.location ? (
                      <span className={cn(stale && "text-amber-600")}>Seen {ago(t.location.recordedAt, now)}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <WifiOff className="size-3" /> No location yet
                      </span>
                    )}
                    {t.job && ` · ${t.job.number} ${t.job.customerName}`}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="relative h-[28rem] overflow-hidden p-1 lg:h-[34rem]">
        {pins.length === 0 && (
          <div className="bg-background/80 absolute inset-0 z-[500] flex items-center justify-center p-6 text-center backdrop-blur-[1px]">
            <p className="text-muted-foreground max-w-xs text-sm">
              No technician has shared a position in the last 24 hours. When a technician opens the field app and allows
              location access, they appear here.
            </p>
          </div>
        )}
        <TechniciansMap pins={pins} focus={focus} onSelect={setFocus} />
      </Card>
    </div>
  );
}
