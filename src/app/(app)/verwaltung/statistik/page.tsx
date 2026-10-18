import Link from "next/link";
import { parseAvatar } from "@/catalog/avatar";
import { Avatar } from "@/components/avatar";
import { Card } from "@/components/ui";
import { relativeTime } from "@/domain/time";
import { requireAdmin } from "@/server/context";
import { track } from "@/server/queries/analytics";
import {
  householdStats,
  STAT_RANGES,
  type StatRange,
} from "@/server/queries/stats";

const SCREEN_LABELS: Record<string, string> = {
  wohnung: "Wohnung",
  aufgaben: "Aufgaben",
  rangliste: "Rangliste",
  mitteilungen: "Mitteilungen",
  feedback: "Feedback",
  statistik: "Statistik",
};
const ACTION_LABELS: Record<string, string> = {
  task_completed: "Erledigt",
  commitment_created: "Eingeplant",
  ics_download: ".ics geladen",
  absence_created: "Urlaub eingetragen",
  feedback_sent: "Feedback gesendet",
  objection_filed: "Widerspruch",
  objection_vote: "Abgestimmt",
  invite_created: "Einladung erstellt",
  invite_accepted: "Beigetreten",
  household_created: "WG erstellt",
  export: "Export",
};

const pct = (v: number | null) =>
  v === null ? "–" : `${Math.round(v * 100)} %`;

/** Aktive Personen pro Tag als Balken. */
function DayChart({
  data,
  max,
}: {
  data: { day: string; users: number }[];
  max: number;
}) {
  const W = 320;
  const H = 110;
  const bw = W / data.length;
  const top = Math.max(1, max);
  const labelEvery = Math.ceil(data.length / 7);
  return (
    <svg
      viewBox={`0 0 ${W} ${H + 16}`}
      className="w-full"
      role="img"
      aria-label="Aktive Personen pro Tag"
    >
      {data.map((d, i) => {
        const h = (d.users / top) * H;
        return (
          <g key={d.day}>
            <title>{`${d.day}: ${d.users}`}</title>
            <rect
              x={i * bw + bw * 0.15}
              y={H - h}
              width={bw * 0.7}
              height={Math.max(h, d.users ? 2 : 0)}
              rx={Math.min(3, bw * 0.2)}
              className="fill-sage-dark"
            />
            {i % labelEvery === 0 && (
              <text
                x={i * bw + bw / 2}
                y={H + 12}
                fontSize={8}
                textAnchor="middle"
                className="fill-ink/60"
              >
                {d.day.slice(8)}.{d.day.slice(5, 7)}.
              </text>
            )}
          </g>
        );
      })}
      <line x1={0} x2={W} y1={H} y2={H} className="stroke-ink/30" />
    </svg>
  );
}

function Bars({
  rows,
  labels,
}: {
  rows: { key: string; count: number }[];
  labels: Record<string, string>;
}) {
  if (rows.length === 0)
    return <p className="text-sm text-ink/60">Noch keine Daten.</p>;
  const max = rows[0].count;
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li
          key={r.key}
          className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-2 text-sm"
        >
          <span className="truncate">{labels[r.key] ?? r.key}</span>
          <span className="h-3 rounded-full bg-ink/10">
            <span
              className="block h-3 rounded-full bg-sage-dark"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </span>
          <span className="text-right font-semibold">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function StatsPage({
  searchParams,
}: PageProps<"/verwaltung/statistik">) {
  const ctx = await requireAdmin();
  const { tage } = await searchParams;
  const days = (STAT_RANGES as readonly number[]).includes(Number(tage))
    ? (Number(tage) as StatRange)
    : 30;
  const now = new Date();
  track(ctx.db, {
    name: "screen_view",
    screen: "statistik",
    householdId: ctx.household.id,
    userId: ctx.user.id,
  });
  const s = householdStats(ctx.db, {
    householdId: ctx.household.id,
    viewerId: ctx.user.id,
    days,
    now,
    timeZone: ctx.household.timezone,
  });
  const maxDay = Math.max(...s.activePerDay.map((d) => d.users));

  return (
    <div className="flex flex-col gap-4">
      <Link href="/verwaltung" className="text-sm font-semibold text-ink/70">
        ← Admin
      </Link>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Statistik</h1>
        <nav
          aria-label="Zeitraum"
          className="flex rounded-full bg-black/[0.06] p-0.5 text-sm font-semibold"
        >
          {STAT_RANGES.map((r) => (
            <Link
              key={r}
              href={`/verwaltung/statistik?tage=${r}`}
              aria-current={r === days ? "page" : undefined}
              className={`rounded-full px-2.5 py-1 ${r === days ? "bg-white text-ink shadow-[0_1px_4px_rgb(0_0_0/0.12)]" : "text-ink/60"}`}
            >
              {r} T
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center" data-testid="kpis">
        {[
          ["Aktiv (7 T)", `${s.weeklyActive}/${s.members}`],
          ["Erledigt", String(s.tasks.completions)],
          ["Überfällig", pct(s.tasks.overdueShare)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl glass p-2">
            <span className="block text-xl font-bold">{value}</span>
            <span className="text-xs text-ink/70">{label}</span>
          </div>
        ))}
      </div>

      <Card className="flex flex-col gap-2 p-4">
        <h2 className="font-bold">Aktive Personen pro Tag</h2>
        <DayChart data={s.activePerDay} max={maxDay} />
      </Card>

      <Card className="flex flex-col gap-2 p-4">
        <h2 className="font-bold">Mitglieder</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink/60">
              <th className="font-medium">Name</th>
              <th className="text-right font-medium">Sitzungen</th>
              <th className="text-right font-medium">Zuletzt</th>
            </tr>
          </thead>
          <tbody>
            {s.perUser.map((u) => (
              <tr key={u.userId} className="border-t border-ink/10">
                <td className="py-1.5">
                  <span className="flex items-center gap-2">
                    <Avatar
                      config={parseAvatar(u.avatarJson, u.userId)}
                      size={20}
                      title={u.name}
                    />
                    {u.name}
                  </span>
                </td>
                <td className="text-right font-semibold">{u.sessions}</td>
                <td className="text-right text-xs text-ink/70">
                  {u.lastSeen ? relativeTime(u.lastSeen, now) : "nie"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="flex flex-col gap-2 p-4">
        <h2 className="font-bold">Aufrufe pro Screen</h2>
        <Bars rows={s.screens} labels={SCREEN_LABELS} />
      </Card>

      <Card className="flex flex-col gap-2 p-4">
        <h2 className="font-bold">Aktionen</h2>
        <Bars rows={s.actions} labels={ACTION_LABELS} />
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-bold">Aufgaben</h2>
        <p className="text-sm">
          Ø Fortschritt beim Erledigen:{" "}
          <strong>{pct(s.tasks.avgProgress)}</strong>
          <span className="block text-xs text-ink/60">
            Um 100 % heißt: pünktlich im Intervall. Private Zimmer zählen nicht.
          </span>
        </p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <h3 className="mb-1 text-xs font-semibold text-ink/70">
              Am häufigsten
            </h3>
            <ol className="flex flex-col gap-0.5">
              {s.tasks.most.map((t) => (
                <li key={t.taskId}>
                  {t.name} <span className="text-ink/60">({t.count})</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold text-ink/70">
              Am seltensten
            </h3>
            <ol className="flex flex-col gap-0.5">
              {s.tasks.least.map((t) => (
                <li key={t.taskId}>
                  {t.name} <span className="text-ink/60">({t.count})</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Card>
    </div>
  );
}
