"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";

export type LatLng = { lat: number; lng: number };
export type MapPin = LatLng & { id: string; label: string };

/** CSS dot instead of Leaflet's PNG marker (whose image paths break under bundlers). */
const pinIcon = (active = false) =>
  L.divIcon({
    className: "",
    html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.45);background:${active ? "#dc2626" : "#2563eb"}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const WORLD: LatLng = { lat: 20, lng: 0 };

function ClickToPin({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FlyTo({ to, zoom }: { to: LatLng | null; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (to) map.flyTo([to.lat, to.lng], Math.max(map.getZoom(), zoom), { duration: 0.6 });
  }, [to, zoom, map]);
  return null;
}

function FitPins({ pins }: { pins: MapPin[] }) {
  const map = useMap();
  useEffect(() => {
    if (pins.length === 1) map.setView([pins[0].lat, pins[0].lng], 15);
    else if (pins.length > 1) map.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng])), { padding: [30, 30] });
  }, [pins, map]);
  return null;
}

/** Click (or drag the pin) to set a location. */
export function PickerMap({
  value,
  onChange,
  fallbackCenter,
}: {
  value: LatLng | null;
  onChange: (p: LatLng) => void;
  fallbackCenter?: LatLng | null;
}) {
  const center = value ?? fallbackCenter ?? WORLD;
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={value ? 16 : fallbackCenter ? 12 : 2}
      className="h-full w-full rounded-md"
      scrollWheelZoom
    >
      <TileLayer url={TILES} attribution={ATTRIBUTION} />
      <ClickToPin onPick={onChange} />
      <FlyTo to={value} zoom={15} />
      {value && (
        <Marker
          position={[value.lat, value.lng]}
          icon={pinIcon(true)}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng();
              onChange({ lat: p.lat, lng: p.lng });
            },
          }}
        />
      )}
    </MapContainer>
  );
}

/** Read-only map of several pins (a customer's sites). */
export function PinsMap({ pins }: { pins: MapPin[] }) {
  const first = pins[0] ?? WORLD;
  return (
    <MapContainer
      center={[first.lat, first.lng]}
      zoom={13}
      className="h-full w-full rounded-md"
      scrollWheelZoom={false}
    >
      <TileLayer url={TILES} attribution={ATTRIBUTION} />
      <FitPins pins={pins} />
      {pins.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon()}>
          <Tooltip direction="top" offset={[0, -8]}>
            {p.label}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
