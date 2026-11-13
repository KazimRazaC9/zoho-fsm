import { describe, expect, it } from "vitest";
import {
  EVIDENCE_LIMITS,
  OTHER_PHOTO_LIMIT,
  VIDEO_BITRATE,
  VIDEO_HEIGHT,
  VIDEO_MAX_SECONDS,
  VIDEO_WIDTH,
  videoSizeMb,
  missingSlotPhotos,
  slotsFor,
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

  it("lists the five labeled photos, and two more when a temperature sensor is installed", () => {
    expect(slotsFor(false).map((x) => x.label)).toEqual([
      "Vehicle Front View",
      "Device Installed Photo",
      "Cabin View Photo",
      "Odo Meter View",
      "Back Camera Installed Photo",
    ]);
    expect(
      slotsFor(true)
        .map((x) => x.label)
        .slice(5),
    ).toEqual(["Temp Probe Photo", "Temp Sensor Photo"]);
    expect(OTHER_PHOTO_LIMIT).toBe(15);
  });

  it("counts the labeled photos still missing, before and after", () => {
    const some = [{ slot: "FRONT_VIEW" }, { slot: "ODOMETER" }, { slot: null }];
    expect(missingSlotPhotos({ before: some, after: [] }, false)).toEqual({ before: 3, after: 5 });
    expect(missingSlotPhotos({ before: some, after: [] }, true)).toEqual({ before: 5, after: 7 });
  });

  it("reads a valid slot from an upload form and ignores unknown ones", () => {
    const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
    expect(evidenceFieldsFrom(form({ phase: "AFTER", slot: "TEMP_PROBE" })).slot).toBe("TEMP_PROBE");
    expect(evidenceFieldsFrom(form({ phase: "AFTER", slot: "SELFIE" })).slot).toBeUndefined();
  });

  it("records videos at 720p for at most 60 seconds, about 12 MB at the longest", () => {
    expect([VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_MAX_SECONDS, VIDEO_BITRATE]).toEqual([1280, 720, 60, 1_500_000]);
    expect(videoSizeMb(60)).toBeCloseTo(11.7, 1);
    // Far under the 50 MB server limit, which only guards videos that did not come from the app recorder.
    expect(videoSizeMb(VIDEO_MAX_SECONDS)).toBeLessThan(50 / 4);
  });
});
