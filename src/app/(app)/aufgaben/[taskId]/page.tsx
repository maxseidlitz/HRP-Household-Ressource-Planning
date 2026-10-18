import Link from "next/link";
import { notFound } from "next/navigation";
import { parseAvatar } from "@/catalog/avatar";
import { objectEmoji } from "@/catalog/objects";
import { Avatar } from "@/components/avatar";
import { commitmentLabel } from "@/components/commitment-badge";
import { CommitmentForm } from "@/components/commitment-form";
import { CompleteButton } from "@/components/complete-button";
import { ObjectionMenu } from "@/components/objection-menu";
import { STATUS_LABELS, StatusBar } from "@/components/status-bar";
import { TaskEditForm } from "@/components/task-edit-form";
import { dueLabel } from "@/components/task-row";
import { Button, Card } from "@/components/ui";
import { formatPoints } from "@/domain/points";
import {
  atLocalHour,
  formatDateTime,
  suggestPlannedFor,
  toLocalInputValue,
  zonedStartOfNextDay,
} from "@/domain/time";
import { cancelCommitmentAction } from "@/server/actions/planning";
import { deleteTaskAction, setTaskActiveAction } from "@/server/actions/rooms";
import { requireHousehold } from "@/server/context";
import { canObject, objectionsByCompletion } from "@/server/queries/objections";
import { getTaskView, taskHistory } from "@/server/queries/tasks";

export default async function TaskPage({
  params,
}: PageProps<"/aufgaben/[taskId]">) {
  const { taskId } = await params;
  const ctx = await requireHousehold();
  const now = new Date();
  const t = getTaskView(ctx.db, {
    householdId: ctx.household.id,
    viewerId: ctx.user.id,
    taskId,
    now,
  });
  if (!t) notFound();
  const history = taskHistory(ctx.db, t.id);
  const objections = objectionsByCompletion(
    ctx.db,
    history.map((c) => c.id),
  );
  // Menü nur, wo ein Widerspruch gerade möglich ist (Spez. 6.3)
  const objectable = new Set(
    ctx.household.settings.objectionsEnabled && !t.isPrivate
      ? history
          .filter(
            (c) =>
              !canObject(ctx.db, {
                viewerId: ctx.user.id,
                completionId: c.id,
                now,
              }),
          )
          .map((c) => c.id)
      : [],
  );
  const canEdit = t.isPrivate || ctx.isAdmin;
  const tz = ctx.household.timezone;
  const { earlyThreshold, lateThreshold } = ctx.household.settings;
  const c = t.commitment;
  const mine = c?.userId === ctx.user.id;
  const canPlan = t.active && !t.isPrivate && (!c || mine);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/aufgaben" className="text-sm font-semibold text-ink/70">
        ← Alle Aufgaben
      </Link>
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-14 items-center justify-center rounded-xl border-2 border-ink text-3xl"
            style={{ backgroundColor: `${t.color}66` }}
          >
            {objectEmoji(t.objectType)}
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{t.name}</h1>
            <p className="text-sm text-ink/70">
              {t.roomName} · {t.objectName}
              {t.isPrivate && " · privat"}
            </p>
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-sm font-semibold">
            <span>{STATUS_LABELS[t.status]}</span>
            <span>{Math.round(t.progress * 100)} %</span>
          </div>
          <StatusBar
            progress={t.progress}
            color={t.color}
            status={t.status}
            early={earlyThreshold}
            late={lateThreshold}
          />
          <p className="mt-1 text-xs text-ink/70">
            {dueLabel(t, now)} · alle {formatPoints(t.intervalDays)} Tage
            {!t.isPrivate && ` · Aufwand ×${formatPoints(t.multiplier)}`}
          </p>
        </div>
        {t.active ? (
          <CompleteButton
            taskId={t.id}
            taskName={t.name}
            pointsNow={t.pointsNow}
          />
        ) : (
          <p className="rounded-lg bg-cream-dark p-2 text-sm">
            Diese Aufgabe ist pausiert.
          </p>
        )}
      </Card>

      {t.active && !t.isPrivate && (
        <Card className="flex flex-col gap-3">
          <h2 id="einplanen" className="font-bold">
            Einplanen
          </h2>
          {c && (
            <div
              className="flex items-center gap-3 rounded-xl bg-white/70 px-3 py-2"
              data-testid="commitment"
            >
              <span aria-hidden className="text-2xl">
                ⏰
              </span>
              <span className="flex-1 text-sm">
                <strong>{mine ? "Du" : c.userName}</strong>{" "}
                {mine ? "hast" : "hat"} das eingeplant für{" "}
                <strong>{formatDateTime(c.plannedFor, tz)}</strong>
                <span className="sr-only"> ({commitmentLabel(c, tz)})</span>
              </span>
            </div>
          )}
          {mine && c && (
            <div className="flex gap-2">
              <a
                href={`/api/ics/${c.id}`}
                className="flex-1 rounded-xl border-2 border-b-4 border-ink bg-white px-3 py-2 text-center text-sm font-semibold"
                download
              >
                📅 In den Kalender
              </a>
              <form action={cancelCommitmentAction}>
                <input type="hidden" name="commitmentId" value={c.id} />
                <Button variant="secondary" className="text-sm">
                  Absagen
                </Button>
              </form>
            </div>
          )}
          {canPlan ? (
            <CommitmentForm
              key={c?.plannedFor.toISOString() ?? "neu"}
              taskId={t.id}
              replan={Boolean(c)}
              min={toLocalInputValue(now, tz)}
              suggestion={toLocalInputValue(
                c?.plannedFor ?? suggestPlannedFor(now, t.dueAt, tz),
                tz,
              )}
              quick={quickPicks(now, tz)}
            />
          ) : (
            <p className="text-xs text-ink/70">
              Erledigen darf trotzdem jede:r, dann gilt die Einplanung als
              erfüllt.
            </p>
          )}
        </Card>
      )}

      <section aria-labelledby="historie">
        <h2 id="historie" className="mb-2 font-bold">
          Historie
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-ink/70">Noch nie erledigt.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((c) => (
              <li
                key={c.id}
                className={`flex items-center gap-3 rounded-xl bg-white/60 px-3 py-2 ${c.status === "revoked" ? "opacity-60" : ""}`}
              >
                <Avatar
                  config={parseAvatar(c.avatarJson, c.userId)}
                  size={24}
                  title={c.userName}
                />
                <span className="flex-1 text-sm">
                  <strong
                    className={c.status === "revoked" ? "line-through" : ""}
                  >
                    {c.userName}
                  </strong>
                  <span className="block text-xs text-ink/65">
                    {formatDateTime(c.completedAt, tz)}
                    {c.source === "vacation" && " · Urlaubspaket"}
                  </span>
                  {objections.has(c.id) && (
                    <Link
                      href={`/widerspruch/${objections.get(c.id)}`}
                      className="mt-0.5 inline-block rounded-full border border-ink/40 bg-white px-2 text-xs font-semibold"
                    >
                      {c.status === "contested"
                        ? "✋ angefochten · abstimmen"
                        : c.status === "revoked"
                          ? "↩️ zurückgesetzt"
                          : "✅ Widerspruch abgelehnt"}
                    </Link>
                  )}
                </span>
                {!t.isPrivate && (
                  <span
                    className={`text-sm font-bold ${c.status !== "valid" ? "text-ink/40 line-through" : ""}`}
                  >
                    {c.points > 0 ? `+${formatPoints(c.points)}` : "0"}
                  </span>
                )}
                {objectable.has(c.id) && (
                  <ObjectionMenu completionId={c.id} userName={c.userName} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit && (
        <details className="rounded-2xl border-2 border-ink/40 p-4">
          <summary className="cursor-pointer font-bold">Bearbeiten</summary>
          <div className="mt-3 flex flex-col gap-4">
            <TaskEditForm task={t} />
            <div className="flex gap-2">
              <form action={setTaskActiveAction} className="flex-1">
                <input type="hidden" name="taskId" value={t.id} />
                <input type="hidden" name="active" value={String(!t.active)} />
                <Button variant="secondary" className="w-full">
                  {t.active ? "Pausieren" : "Reaktivieren"}
                </Button>
              </form>
              <form action={deleteTaskAction} className="flex-1">
                <input type="hidden" name="taskId" value={t.id} />
                <input type="hidden" name="roomId" value={t.roomId} />
                <Button
                  variant="secondary"
                  className="w-full text-status-overdue"
                >
                  Löschen
                </Button>
              </form>
            </div>
            {!t.active && (
              <p className="text-xs text-ink/70">
                Beim Reaktivieren beginnt die Zählung neu.
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

/** Schnellwahl: heute Abend, morgen Abend, Samstag Vormittag. */
function quickPicks(now: Date, tz: string) {
  const picks: { label: string; value: string }[] = [];
  const soon = now.getTime() + 3_600_000;
  const tonight = atLocalHour(now, 18, tz);
  if (tonight.getTime() > soon)
    picks.push({
      label: "Heute 18 Uhr",
      value: toLocalInputValue(tonight, tz),
    });
  const tomorrow = zonedStartOfNextDay(now, tz);
  picks.push({
    label: "Morgen 18 Uhr",
    value: toLocalInputValue(atLocalHour(tomorrow, 18, tz), tz),
  });
  let day = tomorrow;
  for (let i = 0; i < 7; i++) {
    const weekday = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: tz,
    }).format(day);
    if (weekday === "Sat") break;
    day = zonedStartOfNextDay(day, tz);
  }
  picks.push({
    label: "Samstag 11 Uhr",
    value: toLocalInputValue(atLocalHour(day, 11, tz), tz),
  });
  return picks;
}
