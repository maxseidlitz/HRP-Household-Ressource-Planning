import Link from "next/link";
import { ROOM_TYPE_EMOJI } from "@/catalog/rooms";
import { TaskRow } from "@/components/task-row";
import { requireHousehold } from "@/server/context";
import { track } from "@/server/queries/analytics";
import { listTaskViews } from "@/server/queries/tasks";

export default async function TasksPage({
  searchParams,
}: PageProps<"/aufgaben">) {
  const ctx = await requireHousehold();
  const { raum, willkommen } = await searchParams;
  const now = new Date();
  const all = listTaskViews(ctx.db, {
    householdId: ctx.household.id,
    viewerId: ctx.user.id,
    now,
  });
  track(ctx.db, {
    name: "screen_view",
    screen: "aufgaben",
    householdId: ctx.household.id,
    userId: ctx.user.id,
  });

  const rooms = [
    ...new Map(
      all.map((t) => [
        t.roomId,
        { id: t.roomId, name: t.roomName, type: t.roomType },
      ]),
    ).values(),
  ];
  const tasks = raum ? all.filter((t) => t.roomId === raum) : all;
  const overdue = all.filter(
    (t) => t.status === "overdue" || t.status === "filthy",
  ).length;

  return (
    <div className="flex flex-col gap-4">
      {willkommen && (
        <p className="rounded-xl border-2 border-ink bg-status-sweet/40 p-3 text-sm font-medium">
          Willkommen in {ctx.household.name}! 🎉
        </p>
      )}
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Aufgaben</h1>
        {all.length > 0 && (
          <span className="text-sm text-ink/70">
            {overdue === 0
              ? "Alles im grünen Bereich"
              : `${overdue} überfällig`}
          </span>
        )}
      </div>

      {rooms.length > 1 && (
        <nav
          aria-label="Nach Raum filtern"
          className="-mx-4 overflow-x-auto px-4"
        >
          <ul className="flex gap-2">
            <li>
              <FilterChip href="/aufgaben" active={!raum}>
                Alle
              </FilterChip>
            </li>
            {rooms.map((r) => (
              <li key={r.id}>
                <FilterChip
                  href={`/aufgaben?raum=${r.id}`}
                  active={raum === r.id}
                >
                  {ROOM_TYPE_EMOJI[r.type]} {r.name}
                </FilterChip>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {all.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-ink/40 p-6 text-center">
          <p className="mb-3 font-semibold">Noch keine Aufgaben.</p>
          {ctx.isAdmin ? (
            <Link
              href="/verwaltung/wohnung"
              className="font-semibold underline"
            >
              Räume und Aufgaben anlegen →
            </Link>
          ) : (
            <p className="text-sm text-ink/70">
              Sobald ein Admin Aufgaben anlegt, erscheinen sie hier.
            </p>
          )}
        </div>
      ) : (
        <ul
          className="flex flex-col gap-3"
          aria-label="Aufgaben nach Dringlichkeit"
        >
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`block whitespace-nowrap rounded-full border-2 border-ink px-3 py-1 text-sm font-semibold ${active ? "bg-ink text-cream" : "bg-white/70"}`}
    >
      {children}
    </Link>
  );
}
