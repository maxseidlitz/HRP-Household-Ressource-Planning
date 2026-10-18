import { describe, expect, it } from "vitest";
import { buildIcs, foldLine, icsEscape } from "./ics";
import { describeNotification } from "./notifications";
import {
  suggestPlannedFor,
  localDateKey,
  parseLocalDateTime,
  toLocalInputValue,
  weekdayShort,
  zonedStartOfDay,
  zonedStartOfNextDay,
} from "./time";
import { defaultLinkedTasks, isAway } from "./vacation";

const TZ = "Europe/Berlin";

describe("Zeitzonen für Einplanen", () => {
  it("liest Wanduhrzeiten der WG", () => {
    expect(parseLocalDateTime("2026-10-23T18:00", TZ)).toEqual(
      new Date("2026-10-23T16:00:00Z"),
    );
    expect(parseLocalDateTime("2026-12-23T18:00", TZ)).toEqual(
      new Date("2026-12-23T17:00:00Z"),
    );
    expect(parseLocalDateTime("2026-10-23", TZ)).toEqual(
      new Date("2026-10-22T22:00:00Z"),
    );
    expect(parseLocalDateTime("23.10.2026", TZ)).toBeNull();
  });

  it("schreibt Werte für datetime-local zurück", () => {
    expect(toLocalInputValue(new Date("2026-10-23T16:00:00Z"), TZ)).toBe(
      "2026-10-23T18:00",
    );
  });

  it("kennt Tagesgrenzen auch bei Zeitumstellung", () => {
    const d = new Date("2026-10-25T10:00:00Z"); // Umstellung auf Winterzeit
    expect(zonedStartOfDay(d, TZ)).toEqual(new Date("2026-10-24T22:00:00Z"));
    expect(zonedStartOfNextDay(d, TZ)).toEqual(
      new Date("2026-10-25T23:00:00Z"),
    );
    expect(localDateKey(new Date("2026-10-24T22:30:00Z"), TZ)).toBe(
      "2026-10-25",
    );
  });

  it("liefert kurze Wochentage fürs Wecker-Icon", () => {
    expect(weekdayShort(new Date("2026-10-23T16:00:00Z"), TZ)).toBe("Fr");
  });
});

describe("Einplan-Vorschlag", () => {
  const tz = "Europe/Berlin";
  const now = new Date("2026-10-18T08:00:00Z"); // So 10 Uhr
  it("schlägt den Fälligkeitstag um 18 Uhr vor", () => {
    expect(
      suggestPlannedFor(now, new Date("2026-10-21T07:00:00Z"), tz),
    ).toEqual(new Date("2026-10-21T16:00:00Z"));
  });
  it("nimmt heute oder morgen 18 Uhr, wenn schon fällig", () => {
    const due = new Date("2026-10-10T07:00:00Z");
    expect(suggestPlannedFor(now, due, tz)).toEqual(
      new Date("2026-10-18T16:00:00Z"),
    );
    const evening = new Date("2026-10-18T16:30:00Z");
    expect(suggestPlannedFor(evening, due, tz)).toEqual(
      new Date("2026-10-19T16:00:00Z"),
    );
  });
});

describe(".ics", () => {
  const ics = buildIcs({
    uid: "c1@hrp",
    title: "Klo putzen, gründlich; heute",
    description: "Zeile 1\nZeile 2",
    start: new Date("2026-10-23T16:00:00Z"),
    durationMinutes: 30,
    alarmMinutes: 120,
    now: new Date("2026-10-18T12:00:00Z"),
  });

  it("enthält Termin und Erinnerung", () => {
    expect(ics).toContain("DTSTART:20261023T160000Z");
    expect(ics).toContain("DTEND:20261023T163000Z");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT120M");
    expect(ics).toContain("SUMMARY:Klo putzen\\, gründlich\\; heute");
    expect(ics).toContain("DESCRIPTION:Zeile 1\\nZeile 2");
  });

  it("nutzt CRLF und faltet lange Zeilen", () => {
    expect(
      ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75),
    ).toBe(true);
    const long = foldLine("SUMMARY:" + "ä".repeat(60));
    expect(long).toContain("\r\n ");
    expect(long.replace(/\r\n /g, "")).toBe("SUMMARY:" + "ä".repeat(60));
  });

  it("lässt die Erinnerung bei 0 weg", () => {
    expect(
      buildIcs({
        uid: "x",
        title: "X",
        start: new Date(0),
        durationMinutes: 15,
        alarmMinutes: 0,
        now: new Date(0),
      }),
    ).not.toContain("VALARM");
    expect(icsEscape("a\\b")).toBe("a\\\\b");
    expect(icsEscape("Bad; Küche, Flur")).toBe("Bad\\; Küche\\, Flur");
  });
});

describe("Mitteilungen", () => {
  it("formuliert Texte und Links", () => {
    expect(
      describeNotification(
        "commitment_due",
        JSON.stringify({ taskId: "t", taskName: "Klo" }),
      ),
    ).toEqual({
      icon: "⏰",
      text: "Heute eingeplant: Klo",
      href: "/aufgaben/t",
    });
    expect(
      describeNotification(
        "daily_summary",
        JSON.stringify({ count: 5, names: ["A", "B", "C", "D", "E"] }),
      ).text,
    ).toBe("5 Aufgaben sind überfällig: A, B, C und 2 weitere");
    expect(describeNotification("unbekannt", "kaputt").icon).toBe("🔔");
  });
});

describe("Urlaub", () => {
  it("verknüpft standardmäßig Rest-, Biomüll und Saugen", () => {
    expect(
      defaultLinkedTasks([
        {
          id: "1",
          name: "Restmüll rausbringen",
          objectType: "trash_rest",
          isPrivate: false,
        },
        { id: "2", name: "Biomüll", objectType: "trash_bio", isPrivate: false },
        { id: "3", name: "Saugen", objectType: "floor", isPrivate: false },
        {
          id: "4",
          name: "Gelber Sack",
          objectType: "trash_yellow",
          isPrivate: false,
        },
        { id: "5", name: "Saugen", objectType: "floor", isPrivate: true },
      ]),
    ).toEqual(["1", "2", "3"]);
  });

  it("erkennt Abwesenheit", () => {
    const a = [{ from: new Date(10), to: new Date(20) }];
    expect(isAway(a, new Date(10))).toBe(true);
    expect(isAway(a, new Date(20))).toBe(false);
  });
});
