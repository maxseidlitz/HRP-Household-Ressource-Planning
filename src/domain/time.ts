/** Offset (ms) der Zeitzone zum angegebenen Zeitpunkt: lokal − UTC. */
export function tzOffset(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Jahr und Monat (1–12) des Zeitpunkts in der Zeitzone. */
export function zonedYearMonth(
  date: Date,
  timeZone: string,
): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
  };
}

/** Lokale Mitternacht des 1. im aktuellen Monat der Zeitzone, als UTC-Instant. */
export function zonedStartOfMonth(now: Date, timeZone: string): Date {
  const { year, month } = zonedYearMonth(now, timeZone);
  const guess = Date.UTC(year, month - 1, 1);
  let result = guess - tzOffset(new Date(guess), timeZone);
  // Zweiter Durchlauf korrigiert, falls zwischen guess und result ein
  // Zeitumstellungs-Wechsel liegt.
  result = guess - tzOffset(new Date(result), timeZone);
  return new Date(result);
}

const RTF = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });

/** „in 3 Tagen“, „vor 2 Stunden“, „morgen“ … */
export function relativeTime(target: Date, now: Date): string {
  const diff = target.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  if (abs < HOUR) return RTF.format(Math.round(diff / 60_000), "minute");
  if (abs < DAY) return RTF.format(Math.round(diff / HOUR), "hour");
  return RTF.format(Math.round(diff / DAY), "day");
}

export function formatDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/** Kalenderdatum und Uhrzeit eines Zeitpunkts in der Zeitzone. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Lokale Wanduhrzeit in der Zeitzone → UTC-Zeitpunkt (DST-sicher). */
export function zonedToUtc(p: ZonedParts, timeZone: string): Date {
  const guess = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  let result = guess - tzOffset(new Date(guess), timeZone);
  result = guess - tzOffset(new Date(result), timeZone);
  return new Date(result);
}

export function zonedStartOfDay(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  return zonedToUtc({ ...p, hour: 0, minute: 0 }, timeZone);
}

/** Beginn des folgenden Tages (Tage mit Zeitumstellung haben 23/25 h). */
export function zonedStartOfNextDay(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return zonedToUtc(
    {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      hour: 0,
      minute: 0,
    },
    timeZone,
  );
}

/** „2026-10-18“ in der Zeitzone (für Tages-Schlüssel). */
export function localDateKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Wert für <input type="datetime-local"> in der Zeitzone. */
export function toLocalInputValue(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** „2026-10-20T18:00“ oder „2026-10-20“ (Wanduhrzeit der WG) → Zeitpunkt. */
export function parseLocalDateTime(
  value: string,
  timeZone: string,
): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [year, month, day, hour, minute] = [
    m[1],
    m[2],
    m[3],
    m[4] ?? "0",
    m[5] ?? "0",
  ].map(Number);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  )
    return null;
  return zonedToUtc({ year, month, day, hour, minute }, timeZone);
}

/** Kurzer Wochentag fürs Wecker-Icon („Fr“), Spez. 12.4. */
export function weekdayShort(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone })
    .format(date)
    .replace(".", "");
}

export function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

/** Zeitpunkt um `hour` Uhr am Tag von `date` (Wanduhrzeit der WG). */
export function atLocalHour(date: Date, hour: number, timeZone: string): Date {
  return zonedToUtc(
    { ...zonedParts(date, timeZone), hour, minute: 0 },
    timeZone,
  );
}

/**
 * Vorschlag fürs Einplanen: am Fälligkeitstag um 18 Uhr, frühestens heute
 * 18 Uhr bzw. morgen, wenn es dafür schon zu spät ist.
 */
export function suggestPlannedFor(
  now: Date,
  dueAt: Date,
  timeZone: string,
): Date {
  const HOUR = 18;
  const onDue = atLocalHour(dueAt, HOUR, timeZone);
  if (onDue.getTime() > now.getTime() + 3_600_000) return onDue;
  const today = atLocalHour(now, HOUR, timeZone);
  if (today.getTime() > now.getTime() + 3_600_000) return today;
  return atLocalHour(zonedStartOfNextDay(now, timeZone), HOUR, timeZone);
}
