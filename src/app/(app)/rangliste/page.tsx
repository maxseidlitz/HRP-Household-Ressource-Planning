import Link from "next/link";
import { parseAvatar } from "@/catalog/avatar";
import { Avatar } from "@/components/avatar";
import type { LeaderboardPeriod } from "@/domain/leaderboard";
import { formatPoints } from "@/domain/points";
import { requireHousehold } from "@/server/context";
import { track } from "@/server/queries/analytics";
import { listMembers } from "@/server/queries/households";
import { householdLeaderboard } from "@/server/queries/tasks";

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function LeaderboardPage({
  searchParams,
}: PageProps<"/rangliste">) {
  const ctx = await requireHousehold();
  const { zeitraum } = await searchParams;
  const period: LeaderboardPeriod = zeitraum === "gesamt" ? "total" : "month";
  const now = new Date();
  const board = householdLeaderboard(ctx.db, {
    householdId: ctx.household.id,
    period,
    now,
  });
  const members = new Map(
    listMembers(ctx.db, ctx.household.id).map((m) => [m.userId, m]),
  );
  track(ctx.db, {
    name: "screen_view",
    screen: "rangliste",
    householdId: ctx.household.id,
    userId: ctx.user.id,
    meta: { period },
  });

  const monthName = new Intl.DateTimeFormat("de-DE", {
    month: "long",
    timeZone: ctx.household.timezone,
  }).format(now);
  const podium = board.slice(0, 3);

  if (members.size < 2) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Rangliste</h1>
        <p className="rounded-2xl border-2 border-dashed border-ink/40 p-6 text-center text-sm">
          Die Rangliste erscheint, sobald mindestens zwei Personen in der WG
          sind.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Rangliste</h1>
      <div
        role="tablist"
        aria-label="Zeitraum"
        className="grid grid-cols-2 rounded-xl border-2 border-ink bg-white/60 p-1"
      >
        {(
          [
            ["month", `Monat (${monthName})`, "/rangliste"],
            ["total", "Gesamt", "/rangliste?zeitraum=gesamt"],
          ] as const
        ).map(([p, label, href]) => (
          <Link
            key={p}
            href={href}
            role="tab"
            aria-selected={period === p}
            className={`rounded-lg py-1.5 text-center text-sm font-bold ${period === p ? "bg-ink text-cream" : ""}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <ol className="flex items-end justify-center gap-3" aria-label="Podest">
        {[1, 0, 2].map((i) => {
          const e = podium[i];
          if (!e) return <li key={i} className="w-24" />;
          const m = members.get(e.userId)!;
          const height = ["h-28", "h-20", "h-14"][e.rank - 1] ?? "h-14";
          return (
            <li
              key={e.userId}
              className="flex w-24 flex-col items-center gap-1"
            >
              <Avatar
                config={parseAvatar(m.avatarJson, m.userId)}
                size={36}
                title={m.name}
              />
              <span className="max-w-full truncate text-sm font-bold">
                {m.name}
              </span>
              <div
                className={`${height} flex w-full flex-col items-center justify-start rounded-t-xl border-2 border-ink bg-status-sweet/50 pt-1`}
              >
                <span aria-hidden className="text-xl">
                  {e.points > 0 ? (MEDALS[e.rank - 1] ?? "") : ""}
                </span>
                <span className="font-mono text-sm font-bold">
                  {formatPoints(e.points)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <ol className="flex flex-col gap-2" aria-label="Alle Plätze">
        {board.map((e) => {
          const m = members.get(e.userId)!;
          const me = e.userId === ctx.user.id;
          return (
            <li
              key={e.userId}
              className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2 ${me ? "border-ink bg-sage/30" : "border-transparent bg-white/60"}`}
            >
              <span className="w-6 text-center font-bold">{e.rank}.</span>
              <Avatar
                config={parseAvatar(m.avatarJson, m.userId)}
                size={24}
                title={m.name}
              />
              <span className="flex-1 font-semibold">
                {m.name}
                {me && <span className="text-xs font-normal"> (du)</span>}
              </span>
              <span className="text-xs text-ink/60">{e.completions}×</span>
              <span className="w-14 text-right font-mono font-bold">
                {formatPoints(e.points)}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-center text-xs text-ink/60">
        Die Monatswertung beginnt am 1. jedes Monats wieder bei 0.
      </p>
    </div>
  );
}
