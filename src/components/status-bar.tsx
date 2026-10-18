import type { TaskStatus } from "@/domain/progress";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  paused: "Pausiert",
  fresh: "Frisch",
  sweet: "Sweet Spot",
  soon: "Jetzt ideal",
  overdue: "Überfällig",
  filthy: "Stark überfällig",
};

/**
 * Fortschritt im Intervall mit markiertem Sweet-Spot-Bereich (Spez. 12.6).
 * Die Skala reicht bis 150 %, darüber bleibt der Balken voll.
 */
export function StatusBar({
  progress,
  color,
  status,
  early = 0.4,
  late = 1,
}: {
  progress: number;
  color: string;
  status: TaskStatus;
  early?: number;
  late?: number;
}) {
  const MAX = 1.5;
  const pct = (v: number) => `${(Math.min(v, MAX) / MAX) * 100}%`;
  const pulsing = status === "overdue" || status === "filthy";
  return (
    <div
      className="relative h-3 w-full overflow-hidden rounded-full border-2 border-ink/80 bg-white"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={150}
      aria-valuenow={Math.round(progress * 100)}
      aria-label={`${STATUS_LABELS[status]}, ${Math.round(progress * 100)} %`}
    >
      <div
        className="absolute inset-y-0 bg-status-sweet/25"
        style={{
          left: pct(early),
          width: `calc(${pct(late)} - ${pct(early)})`,
        }}
      />
      <div
        className={`absolute inset-y-0 left-0 rounded-r-full ${pulsing ? "animate-overdue" : ""}`}
        style={{
          width: pct(Math.max(progress, 0.02)),
          backgroundColor: status === "paused" ? "#b8b0a2" : color,
        }}
      />
      <div
        className="absolute inset-y-0 w-0.5 bg-ink/40"
        style={{ left: pct(late) }}
      />
    </div>
  );
}
