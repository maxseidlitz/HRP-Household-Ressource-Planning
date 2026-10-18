import { describe, expect, it } from "vitest";
import { tzOffset, zonedStartOfMonth } from "./time";

describe("Zeitzonen", () => {
  it("kennt Sommer- und Winterzeit in Berlin", () => {
    expect(tzOffset(new Date("2026-07-01T12:00:00Z"), "Europe/Berlin")).toBe(
      2 * 3_600_000,
    );
    expect(tzOffset(new Date("2026-12-01T12:00:00Z"), "Europe/Berlin")).toBe(
      1 * 3_600_000,
    );
  });

  it("beginnt den Monat um Mitternacht Ortszeit", () => {
    // 18.10.2026 → 1.10.2026 00:00 MESZ = 30.09. 22:00 UTC
    expect(
      zonedStartOfMonth(new Date("2026-10-18T12:00:00Z"), "Europe/Berlin"),
    ).toEqual(new Date("2026-09-30T22:00:00Z"));
    // Monat mit Zeitumstellung: 1.11.2026 00:00 MEZ = 31.10. 23:00 UTC
    expect(
      zonedStartOfMonth(new Date("2026-11-15T12:00:00Z"), "Europe/Berlin"),
    ).toEqual(new Date("2026-10-31T23:00:00Z"));
  });

  it("ordnet die Silvesternacht dem richtigen Monat zu", () => {
    // 31.12. 23:30 UTC ist in Berlin schon der 1.1.
    expect(
      zonedStartOfMonth(new Date("2026-12-31T23:30:00Z"), "Europe/Berlin"),
    ).toEqual(new Date("2026-12-31T23:00:00Z"));
  });
});
