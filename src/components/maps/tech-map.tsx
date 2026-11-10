"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";

export type TechPin = { id: string; lat: number; lng: number; label: string; color: string; stale: boolean };

const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const esc = (s: string) => s.replace(/[<>&"']/g, "");

/** A coloured dot with the technician's initials; faded when the last position is old. */
const techIcon = (p: TechPin, selected: boolean) =>
  L.divIcon({
    className: "",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;border:3px solid ${selected ? "#111" : "white"};box-shadow:0 1px 5px rgba(0,0,0,.5);background:${esc(p.color)};color:white;font:600 11px system-ui;opacity:${p.stale ? 0.55 : 1}">${esc(
      p.label
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase(),
    )}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

function Fit({ pins, focus }: { pins: TechPin[]; focus: string | null }) {
  const map = useMap();
  useEffect(() => {
    const f = focus ? pins.find((p) => p.id === focus) : null;
    if (f) map.flyTo([f.lat, f.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
    else if (pins.length === 1) map.setView([pins[0].lat, pins[0].lng], 14);
    else if (pins.length > 1) map.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng])), { padding: [40, 40] });
    // Re-fit only when the focus changes or the set of technicians changes, not on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, pins.map((p) => p.id).join(",")]);
  return null;
}

export function TechniciansMap({
  pins,
  focus,
  onSelect,
}: {
  pins: TechPin[];
  focus: string | null;
  onSelect: (id: string) => void;
}) {
  const first = pins[0] ?? { lat: 30, lng: 70 };
  return (
    <MapContainer
      center={[first.lat, first.lng]}
      zoom={pins.length ? 12 : 5}
      className="h-full w-full rounded-md"
      scrollWheelZoom
    >
      <TileLayer url={TILES} attribution={ATTRIBUTION} />
      <Fit pins={pins} focus={focus} />
      {pins.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={techIcon(p, focus === p.id)}
          eventHandlers={{ click: () => onSelect(p.id) }}
        >
          <Tooltip direction="top" offset={[0, -14]}>
            {p.label}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
