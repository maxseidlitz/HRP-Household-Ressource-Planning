import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  dueAt,
  initialBaseline,
  progress,
  startPoint,
  statusColor,
  taskStatus,
  worstStatus,
} from "./progress";

const T = { earlyThreshold: 0.4, lateThreshold: 1 };
const now = new Date("2026-10-18T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY_MS);

describe("startPoint", () => {
  it("nimmt den Bezugszeitpunkt, solange es keine Erledigung gibt", () => {
    expect(startPoint(daysAgo(3), null)).toEqual(daysAgo(3));
  });
  it("nimmt die neueste gültige Erledigung, wenn sie später liegt", () => {
    expect(startPoint(daysAgo(10), daysAgo(2))).toEqual(daysAgo(2));
  });
  it("nimmt den Bezug bei Reaktivierung nach der letzten Erledigung", () => {
    expect(startPoint(daysAgo(1), daysAgo(40))).toEqual(daysAgo(1));
  });
});

describe("progress", () => {
  it("ist das Verhältnis aus vergangener Zeit und Intervall", () => {
    expect(progress(daysAgo(7), 7, now)).toBe(1);
    expect(progress(daysAgo(3.5), 7, now)).toBe(0.5);
  });
  it("wird nie negativ", () => {
    expect(progress(new Date(now.getTime() + DAY_MS), 7, now)).toBe(0);
  });
  it("berechnet die Fälligkeit rollierend ab dem Startpunkt", () => {
    expect(dueAt(daysAgo(2), 7)).toEqual(new Date(now.getTime() + 5 * DAY_MS));
  });
});

describe("taskStatus", () => {
  it.each([
    [0, "fresh"],
    [0.39, "fresh"],
    [0.4, "sweet"],
    [0.74, "sweet"],
    [0.75, "soon"],
    [1, "soon"],
    [1.01, "overdue"],
    [1.5, "overdue"],
    [1.51, "filthy"],
  ] as const)("Fortschritt %s → %s", (p, expected) => {
    expect(taskStatus(p, T)).toBe(expected);
  });
  it("meldet pausierte Aufgaben als pausiert", () => {
    expect(taskStatus(5, T, false)).toBe("paused");
  });
  it("findet den schlechtesten Status eines Objekts", () => {
    expect(worstStatus(["fresh", "overdue", "sweet"])).toBe("overdue");
    expect(worstStatus([])).toBe("paused");
  });
});

describe("statusColor", () => {
  it("verläuft von grün über gelb und orange nach rot", () => {
    expect(statusColor(0)).toBe("#4caf50");
    expect(statusColor(0.75)).toBe("#fad632");
    expect(statusColor(1)).toBe("#f28c28");
    expect(statusColor(1.2)).toBe("#e04a3c");
  });
  it("interpoliert stufenlos zwischen den Stützstellen", () => {
    const mid = statusColor(0.2);
    expect(mid).not.toBe(statusColor(0));
    expect(mid).not.toBe(statusColor(0.4));
  });
});

describe("initialBaseline", () => {
  it("startet bei „heute“ mit 0 %", () => {
    expect(progress(initialBaseline("today", 7, now), 7, now)).toBe(0);
  });
  it("startet bei „vor ein paar Tagen“ und „weiß nicht“ mit 50 %", () => {
    expect(progress(initialBaseline("some_days", 7, now), 7, now)).toBe(0.5);
    expect(progress(initialBaseline("unknown", 30, now), 30, now)).toBe(0.5);
  });
});
