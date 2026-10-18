import Link from "next/link";
import { requireAdmin } from "@/server/context";
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
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Admin</h1>
      <ul className="flex flex-col gap-3">
        {steps.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-white/70 p-4 shadow-[0_3px_0_0_var(--ink)]"
            >
              <span aria-hidden className="text-3xl">
                {s.icon}
              </span>
              <span className="flex-1">
                <span className="block font-bold">{s.title}</span>
                <span className="block text-sm text-ink/70">{s.text}</span>
              </span>
              <span aria-hidden>{s.done ? "✅" : "→"}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink/60">
        Statistiken, Feedback und weitere Einstellungen folgen in Phase 4.
      </p>
    </div>
  );
}
