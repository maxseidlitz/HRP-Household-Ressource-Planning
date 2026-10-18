"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatPoints } from "@/domain/points";
import { uuid } from "@/lib/uuid";
import { completeTaskAction } from "@/server/actions/tasks";

/**
 * „Erledigt“ mit Punkte-Popup (Spez. 5.5/12.8). Der Idempotenz-Schlüssel
 * bleibt für einen Klick gleich, damit Doppel-Taps nur einmal zählen.
 */
export function CompleteButton({
  taskId,
  taskName,
  pointsNow,
  compact = false,
}: {
  taskId: string;
  taskName: string;
  pointsNow: number;
  compact?: boolean;
}) {
  const router = useRouter();
  const [key, setKey] = useState(uuid);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    kind: "points" | "info" | "error";
    text: string;
  } | null>(null);

  function onClick() {
    startTransition(async () => {
      const r = await completeTaskAction(taskId, key);
      setKey(uuid());
      if (!r.ok) {
        setFeedback({ kind: "error", text: r.error });
        return;
      }
      if (r.result.isPrivate) {
        setFeedback({ kind: "info", text: "Erledigt ✓" });
      } else if (r.result.belowMinimum) {
        setFeedback({
          kind: "info",
          text: "Wurde gerade erst erledigt, diesmal ohne Punkte.",
        });
      } else {
        setFeedback({
          kind: "points",
          text: `+${formatPoints(r.result.points)}`,
        });
      }
      router.refresh();
      setTimeout(() => setFeedback(null), 2200);
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-label={`${taskName} erledigt`}
        className={`rounded-xl border-2 border-ink border-b-4 bg-status-fresh font-bold text-white transition active:translate-y-0.5 active:border-b-2 disabled:opacity-60 ${compact ? "px-3 py-1.5 text-sm" : "w-full px-4 py-3"}`}
      >
        {pending
          ? "…"
          : compact
            ? "✓"
            : `Erledigt${pointsNow > 0 ? ` · +${formatPoints(pointsNow)}` : ""}`}
      </button>
      {feedback && (
        <span
          role="status"
          className={`pointer-events-none absolute right-0 bottom-full z-10 mb-1 whitespace-nowrap rounded-lg border-2 border-ink px-2 py-0.5 text-sm font-bold ${
            feedback.kind === "points"
              ? "animate-float-up bg-status-sweet font-mono text-lg"
              : feedback.kind === "error"
                ? "bg-status-overdue text-white"
                : "animate-float-up bg-cream"
          }`}
        >
          {feedback.text}
        </span>
      )}
    </div>
  );
}
