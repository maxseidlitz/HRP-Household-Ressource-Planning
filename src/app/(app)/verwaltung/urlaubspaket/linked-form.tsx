"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-state";
import { Button } from "@/components/ui";
import { setLinkedTasksAction } from "@/server/actions/planning";

export function LinkedTasksForm({
  candidates,
  selected,
}: {
  candidates: { id: string; name: string; place: string }[];
  selected: string[];
}) {
  const [state, action, pending] = useActionState(setLinkedTasksAction, null);
  const chosen = new Set(selected);
  return (
    <form action={action} className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1.5">
        {candidates.map((t) => (
          <li key={t.id}>
            <label className="flex items-center gap-3 rounded-xl bg-white/60 px-3 py-2">
              <input
                type="checkbox"
                name="taskId"
                value={t.id}
                defaultChecked={chosen.has(t.id)}
                className="size-5 accent-sage-dark"
              />
              <span className="flex-1 text-sm">
                <strong>{t.name}</strong>
                <span className="block text-xs text-ink/60">{t.place}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Button disabled={pending}>Speichern</Button>
      <FormMessage state={state} success="Gespeichert." />
    </form>
  );
}
