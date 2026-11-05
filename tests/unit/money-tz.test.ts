import { describe, expect, it } from "vitest";
import { computeTotals } from "@/lib/money";
import { formatNumber } from "@/lib/numbers";
import { dayRangeUtc, isValidTimeZone } from "@/lib/tz";

describe("money", () => {
  it("computes totals to the cent with decimals, not floats", () => {
    const t = computeTotals(
      [
        { qty: 3, unitPrice: "0.10", taxPercent: 16 },
        { qty: "1.5", unitPrice: "3500", taxPercent: 16 },
      ],
      "100",
    );
    expect(t.subTotal.toFixed(2)).toBe("5250.30");
    expect(t.tax.toFixed(2)).toBe("840.05");
    expect(t.total.toFixed(2)).toBe("5990.35");
  });

  it("never returns a negative total", () => {
    expect(computeTotals([{ qty: 1, unitPrice: 10, taxPercent: 0 }], 50).total.toFixed(2)).toBe("0.00");
  });
});

describe("time zones", () => {
  it("returns the UTC range of a local day", () => {
    const { start, end } = dayRangeUtc("2026-11-04", "Asia/Karachi");
    expect(start.toISOString()).toBe("2026-11-03T19:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-04T19:00:00.000Z");
  });

  it("handles a DST day (23 hours)", () => {
    const { start, end } = dayRangeUtc("2026-03-08", "America/New_York");
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });

  it("validates IANA ids", () => {
    expect(isValidTimeZone("Asia/Karachi")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });
});

describe("document numbers", () => {
  it("pads to six digits", () => {
    expect(formatNumber("WO", 123)).toBe("WO-000123");
  });
});
