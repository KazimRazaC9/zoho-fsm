import { describe, expect, it } from "vitest";
import {
  BLANK_SERVICE_FORM,
  CHECK_POINTS,
  cleanReplaced,
  COMPONENTS,
  FINAL_RESULTS,
  serviceFormGaps,
  serviceFormSchema,
  VISIT_REASONS,
  VISIT_TYPES,
  WORK_DONE,
} from "@/modules/work-orders/service-form";

describe("the DriveSense job form", () => {
  it("has the lists of the paper form", () => {
    expect(VISIT_TYPES.map((t) => t.label)).toEqual([
      "New Installation",
      "Reinstallation",
      "Uninstallation",
      "Tampering",
      "Redo",
      "Servicing",
    ]);
    expect(VISIT_REASONS).toHaveLength(11);
    expect(CHECK_POINTS).toHaveLength(10);
    expect(WORK_DONE).toHaveLength(12);
    expect(COMPONENTS).toHaveLength(9);
    expect(FINAL_RESULTS.map((r) => r.label)).toEqual([
      "Issue Resolved",
      "Partially Resolved",
      "Not Resolved",
      "Vehicle Under Observation",
    ]);
    // Every label has its Urdu text.
    for (const item of [...VISIT_TYPES, ...VISIT_REASONS, ...WORK_DONE, ...COMPONENTS, ...FINAL_RESULTS, ...CHECK_POINTS])
      expect(item.ur.length).toBeGreaterThan(0);
  });

  it("accepts a filled form and a blank one", () => {
    expect(serviceFormSchema.safeParse(BLANK_SERVICE_FORM).success).toBe(true);
    const filled = serviceFormSchema.safeParse({
      ...BLANK_SERVICE_FORM,
      vehicleNumber: " LES-2231 ",
      visitTypes: ["SERVICING", "TAMPERING"],
      visitReasons: ["CAMERA_NOT_WORKING"],
      checks: { DEVICE_POWER: "OK", BACK_CAMERA: "NA", ONLINE_ON_PORTAL: "YES", RECORDING_STATUS: "NOT_RECORDING" },
      replaced: { SD_CARD: { replaced: "YES", oldDetails: "A1", newDetails: "B2", remarks: "corrupt" } },
      finalResult: "RESOLVED",
    });
    expect(filled.success).toBe(true);
    expect(filled.success && filled.data.vehicleNumber).toBe("LES-2231");
  });

  it("lets a check point take only its own answers", () => {
    const bad = (checks: Record<string, string>) =>
      serviceFormSchema.safeParse({ ...BLANK_SERVICE_FORM, checks }).success;
    expect(bad({ DEVICE_POWER: "NA" })).toBe(false); // only the back camera may be N/A
    expect(bad({ ONLINE_ON_PORTAL: "OK" })).toBe(false); // that one is Yes / No
    expect(bad({ RECORDING_STATUS: "YES" })).toBe(false);
    expect(bad({ BACK_CAMERA: "NA" })).toBe(true);
    expect(bad({ SELFIE: "OK" })).toBe(false); // unknown check point
  });

  it("rejects unknown choices", () => {
    const bad = (patch: object) => serviceFormSchema.safeParse({ ...BLANK_SERVICE_FORM, ...patch }).success;
    expect(bad({ visitTypes: ["FLYING"] })).toBe(false);
    expect(bad({ finalResult: "MAYBE" })).toBe(false);
    expect(bad({ workDone: ["DANCING"] })).toBe(false);
    expect(bad({ replaced: { ENGINE: { replaced: "YES", oldDetails: "", newDetails: "", remarks: "" } } })).toBe(false);
  });

  it("lists what is still empty before closing (a reminder, not a lock)", () => {
    expect(serviceFormGaps(null)).toEqual(["Vehicle number", "Visit type", "Visit reason", "Final result"]);
    expect(serviceFormGaps(BLANK_SERVICE_FORM)).toEqual(["Vehicle number", "Visit type", "Visit reason", "Final result"]);
    expect(
      serviceFormGaps({
        ...BLANK_SERVICE_FORM,
        vehicleNumber: "LES-1",
        visitTypes: ["REDO"],
        visitReasonOther: "Dashcam fell",
        finalResult: "PARTIAL",
      }),
    ).toEqual([]);
    expect(serviceFormGaps({ ...BLANK_SERVICE_FORM, vehicleNumber: "  " })).toContain("Vehicle number");
  });

  it("keeps only the replaced parts that something was said about", () => {
    const empty = { replaced: null, oldDetails: "", newDetails: "", remarks: "" };
    const cleaned = cleanReplaced({
      DEVICE: { ...empty, replaced: "NO" },
      FUSE: empty,
      WIRES: { ...empty, remarks: "red wire" },
      SIM: { ...empty, oldDetails: "  " },
    });
    expect(Object.keys(cleaned).sort()).toEqual(["DEVICE", "WIRES"]);
  });
});
