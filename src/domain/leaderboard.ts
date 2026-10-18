import { zonedStartOfMonth } from "./time";

export type LeaderboardPeriod = "month" | "total";

export type ScoredCompletion = {
  userId: string;
  points: number;
  completedAt: Date;
  status: "valid" | "contested" | "revoked";
};

export type LeaderboardEntry = {
  userId: string;
  points: number;
  completions: number;
  rank: number;
};

export function periodStart(
  period: LeaderboardPeriod,
  now: Date,
  timeZone: string,
): Date | null {
  return period === "month" ? zonedStartOfMonth(now, timeZone) : null;
}

/**
 * Rangliste mit Rohpunkten (Spez. 6.2). Angefochtene Erledigungen zählen erst,
 * wenn sie bestätigt sind; zurückgesetzte nie. Alle Mitglieder erscheinen,
 * auch mit 0 Punkten. Gleiche Punktzahl → gleicher Rang.
 */
export function leaderboard(
  memberIds: string[],
  completions: ScoredCompletion[],
  since: Date | null,
): LeaderboardEntry[] {
  const totals = new Map(
    memberIds.map((id) => [id, { points: 0, completions: 0 }]),
  );
  for (const c of completions) {
    if (c.status !== "valid") continue;
    if (since && c.completedAt < since) continue;
    const t = totals.get(c.userId);
    if (!t) continue; // ehemaliges Mitglied
    t.points += c.points;
    t.completions += 1;
  }
  const sorted = [...totals.entries()]
    .map(([userId, t]) => ({ userId, ...t }))
    .sort((a, b) => b.points - a.points || b.completions - a.completions);

  let rank = 0;
  let prev: number | null = null;
  return sorted.map((e, i) => {
    if (e.points !== prev) rank = i + 1;
    prev = e.points;
    return { ...e, rank };
  });
}
