import type { Thresholds } from "./settings";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Ab hier wird es orange (rein optischer Hinweis innerhalb des Sweet Spots). */
export const SOON_THRESHOLD = 0.75;
/** Ab hier „stark überfällig“ mit Schmutz-Effekten. */
export const FILTHY_THRESHOLD = 1.5;

export type TaskStatus =
  "paused" | "fresh" | "sweet" | "soon" | "overdue" | "filthy";

/**
 * Startpunkt der Zählung (Spez. 5.2): die neueste gültige Erledigung oder der
 * Bezugszeitpunkt der Aufgabe (Anlage mit „Zuletzt gemacht?“, Reaktivierung),
 * je nachdem, was später liegt.
 */
export function startPoint(
  baselineAt: Date,
  lastValidCompletionAt: Date | null,
): Date {
  if (!lastValidCompletionAt) return baselineAt;
  return lastValidCompletionAt > baselineAt
    ? lastValidCompletionAt
    : baselineAt;
}

/** fortschritt = (jetzt − startpunkt) / intervall, nie negativ. */
export function progress(start: Date, intervalDays: number, now: Date): number {
  const elapsed = now.getTime() - start.getTime();
  return Math.max(0, elapsed / (intervalDays * DAY_MS));
}

export function dueAt(start: Date, intervalDays: number): Date {
  return new Date(start.getTime() + intervalDays * DAY_MS);
}

export function taskStatus(
  p: number,
  t: Pick<Thresholds, "earlyThreshold" | "lateThreshold">,
  active = true,
): TaskStatus {
  if (!active) return "paused";
  if (p > FILTHY_THRESHOLD * t.lateThreshold) return "filthy";
  if (p > t.lateThreshold) return "overdue";
  if (p >= Math.min(SOON_THRESHOLD, t.lateThreshold)) return "soon";
  if (p >= t.earlyThreshold) return "sweet";
  return "fresh";
}

/** Schlechtester Status mehrerer Aufgaben (z. B. für ein Objekt). */
const SEVERITY: TaskStatus[] = [
  "paused",
  "fresh",
  "sweet",
  "soon",
  "overdue",
  "filthy",
];
export function worstStatus(statuses: TaskStatus[]): TaskStatus {
  return statuses.reduce<TaskStatus>(
    (worst, s) => (SEVERITY.indexOf(s) > SEVERITY.indexOf(worst) ? s : worst),
    "paused",
  );
}

/**
 * Stufenloser Farbverlauf grün → gelbgrün → gelb → orange → rot
 * (Spez. 5.3). Liefert einen Hex-Farbwert.
 */
const COLOR_STOPS: [number, [number, number, number]][] = [
  [0, [76, 175, 80]], // grün
  [0.4, [156, 204, 58]], // gelbgrün
  [0.75, [250, 214, 50]], // gelb
  [1, [242, 140, 40]], // orange
  [1.0001, [224, 74, 60]], // rot
];

export function statusColor(p: number): string {
  if (p <= 0) return toHex(COLOR_STOPS[0][1]);
  for (let i = 1; i < COLOR_STOPS.length; i++) {
    const [x1, c1] = COLOR_STOPS[i];
    if (p <= x1) {
      const [x0, c0] = COLOR_STOPS[i - 1];
      const f = (p - x0) / (x1 - x0);
      return toHex([0, 1, 2].map((k) => c0[k] + (c1[k] - c0[k]) * f));
    }
  }
  return toHex(COLOR_STOPS[COLOR_STOPS.length - 1][1]);
}

function toHex(rgb: number[]): string {
  return (
    "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")
  );
}

export type LastDone = "today" | "some_days" | "unknown";

/**
 * Bezugszeitpunkt für eine neue Aufgabe (Spez. 5.2): „heute“ startet bei 0 %,
 * „vor ein paar Tagen“ und „weiß nicht“ bei 50 %.
 */
export function initialBaseline(
  lastDone: LastDone,
  intervalDays: number,
  now: Date,
): Date {
  if (lastDone === "today") return now;
  return new Date(now.getTime() - 0.5 * intervalDays * DAY_MS);
}
