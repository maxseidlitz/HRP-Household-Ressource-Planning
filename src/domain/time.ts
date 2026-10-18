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
