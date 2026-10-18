import type { Thresholds } from "./settings";

export const BASE_POINTS = { early: 2, sweet: 3, overdue: 3 } as const;

/**
 * punkte = basis(phase) × multiplikator, gerundet auf 0,5 (Spez. 6.1).
 * Unter dem Mindestfortschritt gibt es 0 Punkte.
 */
export function pointsFor(
  p: number,
  multiplier: number,
  t: Thresholds,
): number {
  if (p < t.minProgress) return 0;
  const base =
    p < t.earlyThreshold
      ? BASE_POINTS.early
      : p <= t.lateThreshold
        ? BASE_POINTS.sweet
        : BASE_POINTS.overdue;
  return roundHalf(base * multiplier);
}

export function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

export function formatPoints(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}
