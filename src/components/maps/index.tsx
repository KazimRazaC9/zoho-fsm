"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export type { LatLng, MapPin } from "./leaflet-map";

// Leaflet touches `window` when imported, so the maps only load in the browser.
const loading = () => <Skeleton className="h-full w-full rounded-md" />;
export const PickerMap = dynamic(() => import("./leaflet-map").then((m) => m.PickerMap), { ssr: false, loading });
export const PinsMap = dynamic(() => import("./leaflet-map").then((m) => m.PinsMap), { ssr: false, loading });
