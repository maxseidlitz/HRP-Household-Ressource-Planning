import { localDateKey, zonedStartOfDay } from "./time";

/** Kennzahlen fürs Admin-Dashboard (Spez. 9.1), ohne Datenbank. */
export type StatEvent = { userId: string | null; createdAt: Date };

/** Neue Sitzung, wenn zwischen zwei Events mehr als 30 Minuten liegen. */
export const SESSION_GAP_MS = 30 * 60_000;

export function countSessions(times: readonly Date[]): number {
  const sorted = [...times].map((t) => t.getTime()).sort((a, b) => a - b);
  let sessions = 0;
  let last = -Infinity;
  for (const t of sorted) {
    if (t - last > SESSION_GAP_MS) sessions++;
    last = t;
  }
  return sessions;
}

/** Die letzten `days` Kalendertage (inkl. heute) in der Zeitzone. */
export function dayKeys(now: Date, days: number, timeZone: string): string[] {
  const keys: string[] = [];
  let d = zonedStartOfDay(now, timeZone);
  for (let i = 0; i < days; i++) {
    keys.unshift(localDateKey(d, timeZone));
    // Mittag des Vortags, damit Zeitumstellungen nicht stören
    d = zonedStartOfDay(new Date(d.getTime() - 12 * 3_600_000), timeZone);
  }
  return keys;
}

/** Beginn des Zeitraums: Mitternacht vor `days - 1` Tagen. */
export function rangeStart(now: Date, days: number, timeZone: string): Date {
  const first = dayKeys(now, days, timeZone)[0];
  const [y, m, d] = first.split("-").map(Number);
  // Mittag des ersten Tages → dessen Tagesbeginn
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  return zonedStartOfDay(noon, timeZone);
}

/** Aktive Personen pro Tag. */
export function activePerDay(
  events: readonly StatEvent[],
  now: Date,
  days: number,
  timeZone: string,
): { day: string; users: number }[] {
  const buckets = new Map(
    dayKeys(now, days, timeZone).map((k) => [k, new Set<string>()]),
  );
  for (const e of events) {
    if (!e.userId) continue;
    buckets.get(localDateKey(e.createdAt, timeZone))?.add(e.userId);
  }
  return [...buckets].map(([day, set]) => ({ day, users: set.size }));
}

/** Anzahl je Schlüssel, absteigend sortiert. */
export function countBy<T>(
  items: readonly T[],
  key: (t: T) => string | null | undefined,
): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const i of items) {
    const k = key(i);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m]
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
