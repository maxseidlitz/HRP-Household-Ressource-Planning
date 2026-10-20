"use client";

import { useActionState, useState } from "react";
import { createCommitmentAction } from "@/server/actions/planning";
import { submitWithoutReset } from "./form-hooks";
import { FormMessage } from "./form-state";
import { Button, inputClass } from "./ui";

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
    <form onSubmit={submitWithoutReset(action)} className="flex flex-col gap-2">
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
            className={`rounded-full border border-black/5 px-3.5 py-1.5 text-sm font-medium shadow-[0_1px_2px_rgb(0_0_0/0.04)] ${value === q.value ? "bg-ink text-white" : "bg-white"}`}
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
          className={inputClass}
        />
      </label>
      <Button disabled={pending}>
        {replan ? "Verschieben" : "Ich mach das"}
      </Button>
      <FormMessage
        state={state}
        success={replan ? "Verschoben." : "Eingeplant!"}
      />
    </form>
  );
}
