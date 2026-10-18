import { parseAvatar } from "@/catalog/avatar";
import { Avatar } from "@/components/avatar";
import { Button, Card } from "@/components/ui";
import { VACATION_POINTS } from "@/domain/vacation";
import { formatDate, localDateKey } from "@/domain/time";
import { endAbsenceAction } from "@/server/actions/planning";
import { requireHousehold } from "@/server/context";
import {
  awayUserIds,
  bundlesFor,
  linkedTaskIds,
  linkCandidates,
  listAbsences,
} from "@/server/queries/absences";
import { listMembers } from "@/server/queries/households";
import { AbsenceForm, VacationItem } from "./urlaub-forms";

export default async function VacationPage() {
  const ctx = await requireHousehold();
  const now = new Date();
  const tz = ctx.household.timezone;
  const absences = listAbsences(ctx.db, { userId: ctx.user.id, now });
  const bundles = new Map(
    bundlesFor(ctx.db, {
      userId: ctx.user.id,
      householdId: ctx.household.id,
      now,
    }).map((b) => [b.absence.id, b.bundle]),
  );
  const linkedIds = new Set(linkedTaskIds(ctx.db, ctx.household.id));
  const linked = linkCandidates(ctx.db, ctx.household.id).filter((t) =>
    linkedIds.has(t.id),
  );
  const members = listMembers(ctx.db, ctx.household.id);
  const away = awayUserIds(
    ctx.db,
    members.map((m) => m.userId),
    now,
  );
  const awayOthers = members.filter(
    (m) => away.has(m.userId) && m.userId !== ctx.user.id,
  );
  // Das Ende ist exklusiv gespeichert (Beginn des Folgetags).
  const lastDay = (to: Date) => new Date(to.getTime() - 1);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Urlaub</h1>

      {absences.map((a) => {
        const current = a.from <= now;
        const b = bundles.get(a.id);
        return (
          <Card
            key={a.id}
            className={`flex flex-col gap-3 ${current ? "bg-status-sweet/30" : ""}`}
            data-testid="absence"
          >
            <div className="flex items-center gap-3">
              <span aria-hidden className="text-3xl">
                🧳
              </span>
              <div className="flex-1">
                <p className="font-bold">
                  {current ? "Du bist im Urlaub" : "Geplanter Urlaub"}
                </p>
                <p className="text-sm text-ink/70">
                  {formatDate(a.from, tz)} – {formatDate(lastDay(a.to), tz)}
                </p>
              </div>
              <form action={endAbsenceAction}>
                <input type="hidden" name="absenceId" value={a.id} />
                <Button variant="secondary" className="text-sm">
                  {current ? "Bin zurück" : "Absagen"}
                </Button>
              </form>
            </div>
            {current && (
              <p className="text-xs text-ink/70">
                Solange du weg bist, bekommst du keine Erinnerungen und dein
                Avatar wartet mit Koffer.
              </p>
            )}
            {b && (
              <div className="flex flex-col gap-2 rounded-xl bg-white/70 p-3">
                <p className="text-sm font-bold">
                  Urlaubspaket{" "}
                  <span className="font-normal text-ink/60">
                    · bis Urlaubsbeginn
                  </span>
                </p>
                <VacationItem
                  bundleId={b.id}
                  item="fridge"
                  label="Eigene Sachen im Kühlschrank prüfen"
                  points={VACATION_POINTS.fridge}
                  doneAt={b.fridgeDoneAt?.toISOString() ?? null}
                />
                <VacationItem
                  bundleId={b.id}
                  item="vacuumTrash"
                  label="Saugen und Müll rausbringen"
                  points={VACATION_POINTS.vacuumTrash}
                  doneAt={b.vacuumTrashDoneAt?.toISOString() ?? null}
                />
                {linked.length > 0 && (
                  <p className="text-xs text-ink/60">
                    Setzt zurück: {linked.map((t) => t.name).join(", ")}
                  </p>
                )}
              </div>
            )}
          </Card>
        );
      })}

      <Card className="flex flex-col gap-3">
        <h2 className="font-bold">
          {absences.length ? "Weiteren Urlaub eintragen" : "Urlaub eintragen"}
        </h2>
        <p className="text-sm text-ink/70">
          Gilt für alle deine WGs. Vorher gibt es ein Urlaubspaket mit 5
          Punkten: Kühlschrank prüfen, saugen und Müll raus.
        </p>
        <AbsenceForm min={localDateKey(now, tz)} />
      </Card>

      {awayOthers.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Gerade weg</h2>
          <ul className="flex flex-wrap gap-3">
            {awayOthers.map((m) => (
              <li
                key={m.userId}
                className="flex items-center gap-2 rounded-full bg-white/60 py-1 pr-3 pl-1 text-sm opacity-70"
              >
                <Avatar
                  config={parseAvatar(m.avatarJson, m.userId)}
                  size={24}
                  title={m.name}
                />
                {m.name} 🧳
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
