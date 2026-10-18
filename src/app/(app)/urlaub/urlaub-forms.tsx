"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-state";
import { Button, Field } from "@/components/ui";
import { formatPoints } from "@/domain/points";
import {
  completeVacationItemAction,
  createAbsenceAction,
} from "@/server/actions/planning";

export function AbsenceForm({ min }: { min: string }) {
  const [state, action, pending] = useActionState(createAbsenceAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Von" name="from" type="date" required min={min} />
        <Field
          label="Bis (einschließlich)"
          name="to"
          type="date"
          required
          min={min}
        />
      </div>
      <Button disabled={pending}>🧳 Urlaub eintragen</Button>
      <FormMessage state={state} success="Urlaub eingetragen. Gute Reise!" />
    </form>
  );
}

/** Ein Häkchen im Urlaubspaket (Spez. 7). */
export function VacationItem({
  bundleId,
  item,
  label,
  points,
  doneAt,
}: {
  bundleId: string;
  item: "fridge" | "vacuumTrash";
  label: string;
  points: number;
  doneAt: string | null;
}) {
  const [state, action, pending] = useActionState(
    completeVacationItemAction,
    null,
  );
  const done = Boolean(doneAt) || state?.ok;
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="bundleId" value={bundleId} />
      <input type="hidden" name="item" value={item} />
      <button
        disabled={done || pending}
        aria-label={done ? `${label}: erledigt` : `${label} abhaken`}
        className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 border-ink text-lg font-bold ${done ? "bg-sage" : "bg-white"}`}
      >
        {done ? "✓" : ""}
      </button>
      <span
        className={`flex-1 text-sm ${done ? "text-ink/60 line-through" : ""}`}
      >
        {label}
      </span>
      <span className="text-sm font-bold">+{formatPoints(points)}</span>
      {state && !state.ok && <FormMessage state={state} />}
    </form>
  );
}
