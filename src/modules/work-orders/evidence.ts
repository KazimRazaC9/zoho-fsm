/**
 * Before / after proof for a work order, and the extra issues a technician finds on site.
 * Pure rules (no database), so the server enforces them and the screens use the same numbers.
 *
 * The reported problem has its own proof: up to 4 photos and 1 video BEFORE the work and the same
 * AFTER it. Every extra issue found on site carries the same allowance, per issue.
 */
export const EVIDENCE_PHASES = ["BEFORE", "AFTER"] as const;
export type EvidencePhaseValue = (typeof EVIDENCE_PHASES)[number];
export const PHASE_LABEL: Record<EvidencePhaseValue, string> = { BEFORE: "Before", AFTER: "After" };

/**
 * Labeled photos of the reported problem: ONE photo per label, in both Before and After
 * (taking it again replaces the old one). Anything else a technician wants to show goes under
 * "Other photos".
 */
export const PHOTO_SLOTS = [
  { key: "FRONT_VIEW", label: "Vehicle Front View" },
  { key: "DEVICE_INSTALLED", label: "Device Installed Photo" },
  { key: "CABIN_VIEW", label: "Cabin View Photo" },
  { key: "ODOMETER", label: "Odo Meter View" },
  { key: "BACK_CAMERA", label: "Back Camera Installed Photo" },
] as const;

/** Two more labels for vehicles that have a temperature sensor installed. */
export const TEMP_SLOTS = [
  { key: "TEMP_PROBE", label: "Temp Probe Photo" },
  { key: "TEMP_SENSOR", label: "Temp Sensor Photo" },
] as const;

export type PhotoSlotKey = (typeof PHOTO_SLOTS)[number]["key"] | (typeof TEMP_SLOTS)[number]["key"];
export type PhotoSlot = { key: PhotoSlotKey; label: string };

/** The labels to show: the five standard ones, plus the temperature pair when a sensor is installed. */
export const slotsFor = (hasTempSensor: boolean): PhotoSlot[] => [...PHOTO_SLOTS, ...(hasTempSensor ? TEMP_SLOTS : [])];

export const SLOT_LABEL: Record<string, string> = Object.fromEntries(
  [...PHOTO_SLOTS, ...TEMP_SLOTS].map((s) => [s.key, s.label]),
);
export const isSlotKey = (v: string): v is PhotoSlotKey => v in SLOT_LABEL;
export const isTempSlot = (v: string) => TEMP_SLOTS.some((s) => s.key === v);
export const TEMP_SLOT_KEYS: string[] = TEMP_SLOTS.map((s) => s.key);

/**
 * Videos are recorded inside the app: 720p at a fixed bit rate, and never longer than 60 seconds, so a
 * clip is about 12 MB (a phone's own camera app makes 60-100 MB a minute). MAX_VIDEO_MB is the safety
 * net for videos that did not come from the in-app recorder.
 */
export const VIDEO_MAX_SECONDS = 60;
export const VIDEO_WIDTH = 1280;
export const VIDEO_HEIGHT = 720;
export const VIDEO_BITRATE = 1_500_000;
export const VIDEO_AUDIO_BITRATE = 64_000;

/** About how many MB a recording of `seconds` takes at the in-app settings. */
export const videoSizeMb = (seconds: number) => ((VIDEO_BITRATE + VIDEO_AUDIO_BITRATE) * seconds) / 8 / 1_000_000;

/** "Other photos": any extra photos of the job, 15 in total (not per section). */
export const OTHER_PHOTO_LIMIT = 15;

/** How many labeled photos are still missing before and after (to warn before completing). */
export function missingSlotPhotos(
  evidence: { before: { slot: string | null }[]; after: { slot: string | null }[] },
  hasTempSensor: boolean,
): { before: number; after: number } {
  const wanted = slotsFor(hasTempSensor);
  const missing = (items: { slot: string | null }[]) =>
    wanted.filter((s) => !items.some((m) => m.slot === s.key)).length;
  return { before: missing(evidence.before), after: missing(evidence.after) };
}

/** The optional "phase", "issueId" and "slot" fields of an upload form. Anything else is ignored. */
export function evidenceFieldsFrom(form: { get(name: string): unknown }): {
  phase?: EvidencePhaseValue;
  issueId?: string;
  slot?: PhotoSlotKey;
} {
  const phase = form.get("phase");
  const issueId = form.get("issueId");
  const slot = form.get("slot");
  return {
    phase: phase === "BEFORE" || phase === "AFTER" ? phase : undefined,
    issueId: typeof issueId === "string" && issueId.length > 0 && issueId.length <= 40 ? issueId : undefined,
    slot: typeof slot === "string" && isSlotKey(slot) ? slot : undefined,
  };
}

export const EVIDENCE_LIMITS = { PHOTO: 4, VIDEO: 1 } as const;
export type EvidenceKind = keyof typeof EVIDENCE_LIMITS;

/** PHOTO / VIDEO for an image / video content type; null for anything else. */
export function mediaKindOf(contentType: string): EvidenceKind | null {
  if (contentType.startsWith("image/")) return "PHOTO";
  if (contentType.startsWith("video/")) return "VIDEO";
  return null;
}

/** Why one more `kind` cannot be added to a slot that already holds `counts`, or null when it can. */
export function evidenceError(
  counts: Record<EvidenceKind, number>,
  kind: EvidenceKind,
  phase: EvidencePhaseValue,
): string | null {
  if (counts[kind] < EVIDENCE_LIMITS[kind]) return null;
  const max = EVIDENCE_LIMITS[kind];
  const noun = kind === "PHOTO" ? (max === 1 ? "photo" : "photos") : max === 1 ? "video" : "videos";
  return `The ${PHASE_LABEL[phase].toLowerCase()} section already has ${max} ${noun}. Remove one to add another.`;
}

export const ISSUE_STATUSES = ["FOUND", "FIXED", "FOLLOW_UP"] as const;
export type IssueStatusValue = (typeof ISSUE_STATUSES)[number];
export const ISSUE_STATUS_LABEL: Record<IssueStatusValue, string> = {
  FOUND: "Found",
  FIXED: "Fixed",
  FOLLOW_UP: "Needs follow-up",
};

/** Common findings to pick from; the technician can always write their own. */
export const ISSUE_SUGGESTIONS = [
  "Loose or damaged wiring",
  "Power or ignition cable fault",
  "Blown fuse",
  "Camera lens dirty or misaligned",
  "Camera or cable damaged",
  "Storage (SD card / HDD) fault",
  "GPS or antenna signal problem",
  "SIM or connectivity problem",
  "Device mounting loose",
  "Device tampered or removed",
  "Water or moisture damage",
] as const;
