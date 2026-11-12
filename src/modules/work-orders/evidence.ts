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

/** The optional "phase" and "issueId" fields of an upload form. Anything else is ignored. */
export function evidenceFieldsFrom(form: { get(name: string): unknown }): {
  phase?: EvidencePhaseValue;
  issueId?: string;
} {
  const phase = form.get("phase");
  const issueId = form.get("issueId");
  return {
    phase: phase === "BEFORE" || phase === "AFTER" ? phase : undefined,
    issueId: typeof issueId === "string" && issueId.length > 0 && issueId.length <= 40 ? issueId : undefined,
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
