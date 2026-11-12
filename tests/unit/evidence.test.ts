import { describe, expect, it } from "vitest";
import {
  EVIDENCE_LIMITS,
  evidenceError,
  evidenceFieldsFrom,
  ISSUE_SUGGESTIONS,
  mediaKindOf,
} from "@/modules/work-orders/evidence";

describe("before / after evidence rules", () => {
  it("allows 4 photos and 1 video per slot", () => {
    expect(EVIDENCE_LIMITS).toEqual({ PHOTO: 4, VIDEO: 1 });
    expect(evidenceError({ PHOTO: 3, VIDEO: 0 }, "PHOTO", "BEFORE")).toBeNull();
    expect(evidenceError({ PHOTO: 0, VIDEO: 0 }, "VIDEO", "AFTER")).toBeNull();
  });

  it("says plainly when a slot is full", () => {
    expect(evidenceError({ PHOTO: 4, VIDEO: 0 }, "PHOTO", "BEFORE")).toBe(
      "The before section already has 4 photos. Remove one to add another.",
    );
    expect(evidenceError({ PHOTO: 0, VIDEO: 1 }, "VIDEO", "AFTER")).toBe(
      "The after section already has 1 video. Remove one to add another.",
    );
    // A full photo slot does not block the video, and the other way round.
    expect(evidenceError({ PHOTO: 4, VIDEO: 0 }, "VIDEO", "BEFORE")).toBeNull();
    expect(evidenceError({ PHOTO: 0, VIDEO: 1 }, "PHOTO", "BEFORE")).toBeNull();
  });

  it("tells photos and videos apart by content type", () => {
    expect(mediaKindOf("image/jpeg")).toBe("PHOTO");
    expect(mediaKindOf("image/heic")).toBe("PHOTO");
    expect(mediaKindOf("video/mp4")).toBe("VIDEO");
    expect(mediaKindOf("video/quicktime")).toBe("VIDEO");
    expect(mediaKindOf("application/pdf")).toBeNull();
  });

  it("reads only valid phase and issue fields from an upload form", () => {
    const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
    expect(evidenceFieldsFrom(form({ phase: "BEFORE", issueId: "abc" }))).toEqual({ phase: "BEFORE", issueId: "abc" });
    expect(evidenceFieldsFrom(form({ phase: "DURING" }))).toEqual({ phase: undefined, issueId: undefined });
    expect(evidenceFieldsFrom(form({ phase: "AFTER", issueId: "x".repeat(41) })).issueId).toBeUndefined();
  });

  it("offers common issues to pick from", () => {
    expect(ISSUE_SUGGESTIONS.length).toBeGreaterThan(5);
    expect(new Set(ISSUE_SUGGESTIONS).size).toBe(ISSUE_SUGGESTIONS.length);
  });
});
