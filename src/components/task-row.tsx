import Link from "next/link";
import { objectEmoji } from "@/catalog/objects";
import { formatPoints } from "@/domain/points";
import { relativeTime } from "@/domain/time";
import type { CompleteResult, TaskView } from "@/server/queries/tasks";
import { CommitmentBadge } from "./commitment-badge";
import { CompleteButton } from "./complete-button";
import { STATUS_LABELS, StatusBar } from "./status-bar";

export function dueLabel(t: TaskView, now: Date): string {
  if (!t.active) return "pausiert";
  return t.progress > 1
    ? `überfällig seit ${relativeTime(t.dueAt, now).replace(/^vor /, "")}`
    : `fällig ${relativeTime(t.dueAt, now)}`;
}

export function TaskRow({
  task: t,
  now,
  timeZone,
  onCompleted,
}: {
  task: TaskView;
  now: Date;
  timeZone: string;
  onCompleted?: (result: CompleteResult) => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-2xl glass p-3">
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-2xl glass-edge text-2xl"
        style={{ backgroundColor: `${t.color}55` }}
      >
        {objectEmoji(t.objectType)}
      </span>
      <Link href={`/aufgaben/${t.id}`} className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-semibold">{t.name}</span>
          {t.commitment && (
            <CommitmentBadge commitment={t.commitment} timeZone={timeZone} />
          )}
        </span>
        <span className="block truncate text-xs text-ink/65">
          {t.roomName} · {t.objectName} · {dueLabel(t, now)}
        </span>
        <span className="mt-1.5 block">
          <StatusBar progress={t.progress} color={t.color} status={t.status} />
        </span>
        <span className="sr-only">{STATUS_LABELS[t.status]}</span>
      </Link>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {t.active && (
          <>
            {!t.isPrivate && (
              <span className="text-xs font-bold text-ink/70">
                +{formatPoints(t.pointsNow)}
              </span>
            )}
            <CompleteButton
              taskId={t.id}
              taskName={t.name}
              pointsNow={t.pointsNow}
              compact
              onCompleted={onCompleted}
            />
          </>
        )}
      </div>
    </li>
  );
}
