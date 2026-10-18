import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { objectEmoji, suggestionsFor } from "@/catalog/objects";
import { ROOM_TYPE_EMOJI, ROOM_TYPE_LABELS } from "@/catalog/rooms";
import { room } from "@/db/schema";
import { Button } from "@/components/ui";
import { formatPoints } from "@/domain/points";
import {
  assignRoomAction,
  deleteObjectAction,
  deleteRoomAction,
} from "@/server/actions/rooms";
import { requireHousehold } from "@/server/context";
import { listMembers } from "@/server/queries/households";
import { canEditRoom, listRoomContents } from "@/server/queries/rooms";
import { AddObjectForm, AddTasksForm } from "./room-forms";

export default async function RoomPage({
  params,
}: PageProps<"/raum/[roomId]">) {
  const { roomId } = await params;
  const ctx = await requireHousehold();
  const r = ctx.db
    .select()
    .from(room)
    .where(and(eq(room.id, roomId), eq(room.householdId, ctx.household.id)))
    .get();
  if (!r) notFound();

  const members = listMembers(ctx.db, ctx.household.id);
  const owner = members.find((m) => m.userId === r.privateOwnerId);
  const canEdit = canEditRoom(r, ctx.user.id, ctx.isAdmin);
  if (!canEdit && !ctx.isAdmin) notFound();
  const isPrivate = Boolean(r.privateOwnerId);
  // Fremde private Zimmer: auch Admins sehen keinen Inhalt (Spez. 4.2).
  const contents = canEdit ? listRoomContents(ctx.db, r.id) : [];

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={ctx.isAdmin ? "/verwaltung/wohnung" : "/profil"}
        className="text-sm font-semibold text-ink/70"
      >
        ← {ctx.isAdmin ? "Wohnung" : "Profil"}
      </Link>
      <div>
        <h1 className="text-2xl font-bold">
          <span aria-hidden>{ROOM_TYPE_EMOJI[r.type]} </span>
          {r.name}
        </h1>
        <p className="text-sm text-ink/70">
          {ROOM_TYPE_LABELS[r.type]}
          {owner && ` · privat · ${owner.name}`}
        </p>
      </div>

      {!canEdit ? (
        <p className="rounded-2xl border-2 border-dashed border-ink/40 bg-ink/5 p-5 text-center text-sm">
          🔒 Das ist das private Zimmer von {owner?.name}. Nur {owner?.name}{" "}
          kann es einrichten und sieht, was darin ist.
        </p>
      ) : (
        <>
          {isPrivate && (
            <p className="rounded-xl bg-sage/25 p-3 text-sm">
              🔒 Nur du siehst, was in diesem Zimmer ist. Aufgaben hier sind
              privat: keine Punkte, keine Statistik.
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {contents.map((o) => (
              <li
                key={o.id}
                className="rounded-2xl border-2 border-ink bg-white/70 p-3"
              >
                <div className="flex items-center gap-2">
                  <span aria-hidden className="text-2xl">
                    {objectEmoji(o.type)}
                  </span>
                  <h2 className="flex-1 font-bold">{o.name}</h2>
                  {!o.isFloor && (
                    <form action={deleteObjectAction}>
                      <input type="hidden" name="objectId" value={o.id} />
                      <button
                        className="text-xs font-semibold text-status-overdue underline"
                        aria-label={`${o.name} entfernen`}
                      >
                        Entfernen
                      </button>
                    </form>
                  )}
                </div>
                {o.tasks.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {o.tasks.map((t) => (
                      <li key={t.id}>
                        <Link
                          href={`/aufgaben/${t.id}`}
                          className="flex justify-between rounded-lg bg-cream px-2 py-1 text-sm"
                        >
                          <span className={t.active ? "" : "text-ink/50"}>
                            {t.name}
                            {!t.active && " (pausiert)"}
                          </span>
                          <span className="text-ink/60">
                            alle {formatPoints(t.intervalDays)} Tage
                            {!isPrivate && ` · ×${formatPoints(t.multiplier)}`}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-semibold text-sage-dark">
                    + Aufgabe
                  </summary>
                  <div className="mt-2">
                    <AddTasksForm
                      objectId={o.id}
                      isPrivate={isPrivate}
                      suggestions={suggestionsFor(o.type, r.type).filter(
                        (s) => !o.tasks.some((t) => t.name === s.name),
                      )}
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
          <section className="rounded-2xl border-2 border-ink/40 p-4">
            <h2 className="mb-3 font-bold">Objekt hinzufügen</h2>
            <AddObjectForm
              roomId={r.id}
              roomType={r.type}
              isPrivate={isPrivate}
            />
          </section>
        </>
      )}

      {ctx.isAdmin && (
        <details className="rounded-2xl border-2 border-ink/40 p-4">
          <summary className="cursor-pointer font-bold">Raum verwalten</summary>
          <div className="mt-3 flex flex-col gap-3">
            {r.type === "bedroom" && (
              <form action={assignRoomAction} className="flex flex-col gap-2">
                <input type="hidden" name="roomId" value={r.id} />
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Privates Zimmer von
                  <select
                    name="privateOwnerId"
                    defaultValue={r.privateOwnerId ?? ""}
                    className="rounded-lg border-2 border-ink/30 bg-white px-3 py-2 text-base font-normal"
                  >
                    <option value="">— niemandem (Gemeinschaftsraum) —</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-ink/60">
                  Beim Wechsel wird der private Inhalt gelöscht.
                </p>
                <Button variant="secondary">Zuweisung speichern</Button>
              </form>
            )}
            <form action={deleteRoomAction}>
              <input type="hidden" name="roomId" value={r.id} />
              <Button
                variant="secondary"
                className="w-full text-status-overdue"
              >
                Raum löschen (mit allen Aufgaben)
              </Button>
            </form>
          </div>
        </details>
      )}
    </div>
  );
}
