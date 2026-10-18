"use client";

import { useActionState } from "react";
import { updateTaskAction } from "@/server/actions/rooms";
import { FormMessage } from "./form-state";
import { Button, Field } from "./ui";

export function TaskEditForm({
  task,
}: {
  task: { id: string; name: string; intervalDays: number; multiplier: number };
}) {
  const [state, action, pending] = useActionState(updateTaskAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="taskId" value={task.id} />
      <Field label="Name" name="name" defaultValue={task.name} required />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Intervall (Tage)"
          name="intervalDays"
          type="number"
          step="0.5"
          min="0.5"
          max="365"
          defaultValue={task.intervalDays}
          required
        />
        <Field
          label="Multiplikator"
          name="multiplier"
          type="number"
          step="0.5"
          min="0.5"
          max="5"
          defaultValue={task.multiplier}
          required
        />
      </div>
      <FormMessage state={state} success="Gespeichert." />
      <Button type="submit" disabled={pending}>
        Speichern
      </Button>
    </form>
  );
}
