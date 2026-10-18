"use client";

import { startTransition, useActionState, useState } from "react";
import { createCommitmentAction } from "@/server/actions/planning";
import { FormMessage } from "./form-state";
import { Button } from "./ui";

/**
 * „Ich mach das“ mit Termin (Spez. 5.6). Uhrzeit in der Zeitzone der WG,
 * Schnellwahl für die üblichen Fälle.
 */
export function CommitmentForm({
  taskId,
  suggestion,
  quick,
  min,
  replan,
}: {
  taskId: string;
  /** Vorschlag als Wert für datetime-local. */
  suggestion: string;
  quick: { label: string; value: string }[];
  min: string;
  replan: boolean;
}) {
  const [value, setValue] = useState(suggestion);
  const [state, action, pending] = useActionState(createCommitmentAction, null);

  return (
    <form
      onSubmit={(e) => {
        // Ohne automatisches Zurücksetzen, damit die Eingabe bei Fehlern bleibt.
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="taskId" value={taskId} />
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Schnellwahl"
      >
        {quick.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => setValue(q.value)}
            aria-pressed={value === q.value}
            className={`rounded-full border-2 border-ink px-3 py-1 text-sm font-semibold ${value === q.value ? "bg-ink text-cream" : "bg-white"}`}
          >
            {q.label}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Wann?
        <input
          type="datetime-local"
          name="plannedFor"
          required
          min={min}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-lg border-2 border-ink/30 bg-white px-3 py-2 text-base font-normal outline-none focus:border-sage-dark"
        />
      </label>
      <Button disabled={pending}>
        {replan ? "⏰ Verschieben" : "⏰ Ich mach das"}
      </Button>
      <FormMessage
        state={state}
        success={replan ? "Verschoben." : "Eingeplant!"}
      />
    </form>
  );
}
