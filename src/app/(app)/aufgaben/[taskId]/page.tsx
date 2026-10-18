import Link from "next/link";
import { notFound } from "next/navigation";
import { parseAvatar } from "@/catalog/avatar";
import { objectEmoji } from "@/catalog/objects";
import { Avatar } from "@/components/avatar";
import { CompleteButton } from "@/components/complete-button";
import { STATUS_LABELS, StatusBar } from "@/components/status-bar";
import { TaskEditForm } from "@/components/task-edit-form";
import { dueLabel } from "@/components/task-row";
import { Button, Card } from "@/components/ui";
import { formatPoints } from "@/domain/points";
import { formatDateTime } from "@/domain/time";
import { deleteTaskAction, setTaskActiveAction } from "@/server/actions/rooms";
import { requireHousehold } from "@/server/context";
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
  const canEdit = t.isPrivate || ctx.isAdmin;
  const tz = ctx.household.timezone;
  const { earlyThreshold, lateThreshold } = ctx.household.settings;

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
                className={`flex items-center gap-3 rounded-xl bg-white/60 px-3 py-2 ${c.status === "revoked" ? "line-through opacity-60" : ""}`}
              >
                <Avatar
                  config={parseAvatar(c.avatarJson, c.userId)}
                  size={24}
                  title={c.userName}
                />
                <span className="flex-1 text-sm">
                  <strong>{c.userName}</strong>
                  <span className="block text-xs text-ink/65">
                    {formatDateTime(c.completedAt, tz)}
                  </span>
                </span>
                {!t.isPrivate && (
                  <span className="text-sm font-bold">
                    {c.points > 0 ? `+${formatPoints(c.points)}` : "0"}
                  </span>
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
