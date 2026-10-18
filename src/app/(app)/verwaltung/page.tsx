import Link from "next/link";
import { requireAdmin } from "@/server/context";
import { listFeedback } from "@/server/queries/feedback";
import { listMembers } from "@/server/queries/households";
import { listRooms } from "@/server/queries/rooms";
import { listTaskViews } from "@/server/queries/tasks";

export default async function AdminPage() {
  const ctx = await requireAdmin();
  const rooms = listRooms(ctx.db, ctx.household.id).filter(
    (r) => !r.parentRoomId,
  );
  const members = listMembers(ctx.db, ctx.household.id);
  const tasks = listTaskViews(ctx.db, {
    householdId: ctx.household.id,
    viewerId: ctx.user.id,
    now: new Date(),
  }).filter((t) => !t.isPrivate);

  const newTickets = listFeedback(ctx.db, {
    householdId: ctx.household.id,
  }).filter((t) => t.ticket.status === "new").length;

  const steps = [
    {
      href: "/verwaltung/wohnung",
      icon: "🗺️",
      title: "Räume & Aufgaben",
      text: `${rooms.length} Räume · ${tasks.length} Aufgaben`,
      done: tasks.length > 0,
    },
    {
      href: "/plan/bearbeiten",
      icon: "📐",
      title: "Grundriss",
      text: `${rooms.filter((r) => r.tilesJson !== "[]").length} von ${rooms.length} Räumen gezeichnet`,
      done: rooms.length > 0 && rooms.every((r) => r.tilesJson !== "[]"),
    },
    {
      href: "/verwaltung/einladungen",
      icon: "✉️",
      title: "Einladen",
      text: `${members.length} von ${ctx.household.expectedMemberCount} Mitgliedern`,
      done: members.length >= ctx.household.expectedMemberCount,
    },
    {
      href: "/verwaltung/mitglieder",
      icon: "👥",
      title: "Mitglieder",
      text: "Rollen, Passwort-Reset, entfernen",
      done: true,
    },
    {
      href: "/verwaltung/statistik",
      icon: "📊",
      title: "Statistik",
      text: "Aktivität, Screens, Aufgaben-Kennzahlen",
      done: true,
    },
    {
      href: "/verwaltung/feedback",
      icon: "💬",
      title: "Feedback",
      text: newTickets ? `${newTickets} neu` : "Keine neuen Tickets",
      done: newTickets === 0,
    },
    {
      href: "/verwaltung/einstellungen",
      icon: "⚙️",
      title: "Einstellungen",
      text: "Schwellen, Widerspruch, Export",
      done: true,
    },
    {
      href: "/verwaltung/urlaubspaket",
      icon: "🧳",
      title: "Urlaubspaket",
      text: "Welche Aufgaben „Saugen + Müll“ zurücksetzt",
      done: true,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Admin</h1>
      <ul className="glass divide-y divide-black/5 overflow-hidden rounded-3xl">
        {steps.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/50"
            >
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-lg shadow-[0_1px_3px_rgb(0_0_0/0.08)]"
              >
                {s.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{s.title}</span>
                <span className="block truncate text-sm text-ink/60">
                  {s.text}
                </span>
              </span>
              {!s.done && (
                <span
                  aria-label="offen"
                  className="size-2 rounded-full bg-sage"
                />
              )}
              <span aria-hidden className="text-xl text-ink/25">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
