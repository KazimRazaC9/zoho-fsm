import { describe, expect, it } from "vitest";
import { nextStatuses, transitionError } from "@/modules/work-orders/work-order-status";

const ok = { role: "DISPATCHER", openChecklistItems: 0, requireSignature: false, hasSignature: false };

describe("work order state machine", () => {
  it("allows the normal path", () => {
    expect(transitionError("NEW", "SCHEDULED", ok)).toBeNull();
    expect(transitionError("SCHEDULED", "DISPATCHED", ok)).toBeNull();
    expect(transitionError("DISPATCHED", "IN_PROGRESS", ok)).toBeNull();
    expect(transitionError("IN_PROGRESS", "COMPLETED", ok)).toBeNull();
  });

  it("rejects skipping steps with a clear message", () => {
    expect(transitionError("NEW", "COMPLETED", ok)).toBe(
      "A new work order cannot be moved to completed. Allowed: scheduled, on hold, cancelled.",
    );
    expect(transitionError("NEW", "IN_PROGRESS", ok)).toMatch(/cannot be moved to in progress/);
    expect(transitionError("IN_PROGRESS", "CANCELLED", ok)).toMatch(/cannot be moved to cancelled/);
    expect(transitionError("NEW", "NEW", ok)).toBe("The work order is already new.");
  });

  it("requires a reason to hold, cancel or reopen", () => {
    expect(transitionError("NEW", "CANCELLED", ok)).toMatch(/reason/);
    expect(transitionError("NEW", "CANCELLED", { ...ok, reason: "Duplicate" })).toBeNull();
    expect(transitionError("IN_PROGRESS", "ON_HOLD", { ...ok, reason: " " })).toMatch(/reason/);
  });

  it("only lets an Admin reopen", () => {
    expect(transitionError("COMPLETED", "IN_PROGRESS", { ...ok, reason: "Callback" })).toMatch(/Only an Admin/);
    expect(transitionError("COMPLETED", "IN_PROGRESS", { ...ok, role: "ADMIN", reason: "Callback" })).toBeNull();
    expect(nextStatuses("CANCELLED", "DISPATCHER")).toEqual([]);
    expect(nextStatuses("CANCELLED", "ADMIN")).toEqual(["NEW"]);
  });

  it("blocks completion until the checklist is done and a required signature exists", () => {
    expect(transitionError("IN_PROGRESS", "COMPLETED", { ...ok, openChecklistItems: 2 })).toBe(
      "Finish the checklist first: 2 items are not done.",
    );
    expect(transitionError("IN_PROGRESS", "COMPLETED", { ...ok, requireSignature: true })).toMatch(/signature/);
    expect(
      transitionError("IN_PROGRESS", "COMPLETED", { ...ok, requireSignature: true, hasSignature: true }),
    ).toBeNull();
  });
});
