import Link from "next/link";
import { ROOM_TYPE_EMOJI, ROOM_TYPE_LABELS } from "@/catalog/rooms";
import { requireAdmin } from "@/server/context";
import { listMembers } from "@/server/queries/households";
import { listRooms } from "@/server/queries/rooms";
import { CreateRoomForm } from "./create-room-form";

export default async function ApartmentPage({
  searchParams,
}: PageProps<"/verwaltung/wohnung">) {
  const ctx = await requireAdmin();
  const { neu } = await searchParams;
  const rooms = listRooms(ctx.db, ctx.household.id).filter(
    (r) => !r.parentRoomId,
  );
  const members = listMembers(ctx.db, ctx.household.id);
  const names = new Map(members.map((m) => [m.userId, m.name]));

  return (
    <div className="flex flex-col gap-5">
      <Link href="/verwaltung" className="text-sm font-semibold text-ink/70">
        ← Admin
      </Link>
      <h1 className="text-2xl font-bold">Wohnung</h1>
      {neu && (
        <ol className="list-inside list-decimal glass rounded-2xl p-3.5 text-sm">
          <li>Räume anlegen (auch die privaten Zimmer)</li>
          <li>In jedem Raum Objekte und Aufgaben auswählen</li>
          <li>
            <Link href="/verwaltung/einladungen" className="underline">
              Mitbewohner einladen
            </Link>
          </li>
        </ol>
      )}

      {rooms.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rooms.map((r) => {
            const own = r.privateOwnerId === ctx.user.id;
            const foreignPrivate = r.privateOwnerId && !own;
            const body = (
              <>
                <span aria-hidden className="text-2xl">
                  {ROOM_TYPE_EMOJI[r.type]}
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">{r.name}</span>
                  <span className="block text-xs text-ink/65">
                    {ROOM_TYPE_LABELS[r.type]}
                    {r.privateOwnerId &&
                      ` · privat · ${names.get(r.privateOwnerId) ?? "?"}`}
                  </span>
                </span>
                <span aria-hidden>{foreignPrivate ? "🔒" : "→"}</span>
              </>
            );
            return (
              <li key={r.id}>
                <Link
                  href={`/raum/${r.id}`}
                  className={`flex items-center gap-3 rounded-2xl glass p-3 ${foreignPrivate ? "bg-ink/10 text-ink/70" : "bg-white/70"}`}
                >
                  {body}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <section className="rounded-2xl border border-black/10 p-4">
        <h2 className="mb-3 font-bold">Raum hinzufügen</h2>
        <CreateRoomForm
          members={members.map((m) => ({ id: m.userId, name: m.name }))}
        />
      </section>
    </div>
  );
}
