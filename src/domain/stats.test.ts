import { describe, expect, it } from "vitest";
import {
  activePerDay,
  countBy,
  countSessions,
  dayKeys,
  rangeStart,
} from "./stats";

const TZ = "Europe/Berlin";

describe("Statistik", () => {
  it("zählt Sitzungen mit 30-Minuten-Lücke", () => {
    const t = (min: number) => new Date(Date.UTC(2026, 9, 18, 8, min));
    expect(countSessions([])).toBe(0);
    expect(countSessions([t(0), t(10), t(35), t(80), t(81)])).toBe(2);
  });

  it("liefert die letzten Tage auch über die Zeitumstellung", () => {
    // 25.10.2026: Ende der Sommerzeit
    const now = new Date("2026-10-26T10:00:00Z");
    expect(dayKeys(now, 3, TZ)).toEqual([
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
    ]);
    expect(rangeStart(now, 3, TZ)).toEqual(new Date("2026-10-23T22:00:00Z"));
  });

  it("zählt aktive Personen pro Tag einmal", () => {
    const now = new Date("2026-10-18T10:00:00Z");
    const ev = (user: string, iso: string) => ({
      userId: user,
      createdAt: new Date(iso),
    });
    expect(
      activePerDay(
        [
          ev("a", "2026-10-17T08:00:00Z"),
          ev("a", "2026-10-17T09:00:00Z"),
          ev("b", "2026-10-17T21:30:00Z"), // 23:30 in Berlin → 17.
          ev("b", "2026-10-17T22:30:00Z"), // 00:30 in Berlin → 18.
        ],
        now,
        2,
        TZ,
      ),
    ).toEqual([
      { day: "2026-10-17", users: 2 },
      { day: "2026-10-18", users: 1 },
    ]);
  });

  it("zählt nach Schlüssel", () => {
    expect(countBy(["x", "y", "x", null], (v) => v)).toEqual([
      { key: "x", count: 2 },
      { key: "y", count: 1 },
    ]);
  });
});
