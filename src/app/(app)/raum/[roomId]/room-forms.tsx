"use client";

import { startTransition, useActionState, useState } from "react";
import {
  libraryFor,
  suggestionsFor,
  type TaskSuggestion,
} from "@/catalog/objects";
import { ROOM_TYPE_LABELS, type RoomType } from "@/catalog/rooms";
import { FormMessage } from "@/components/form-state";
import { TaskPicker } from "@/components/task-picker";
import { Button, Field } from "@/components/ui";
import { createSubroomAction } from "@/server/actions/plan";
import { addObjectAction, addTasksAction } from "@/server/actions/rooms";
import type { FormState } from "@/server/actions/result";

/**
 * Sendet das Formular ohne Reacts automatisches Zurücksetzen nach der
 * Aktion. Das Zurücksetzen kann sonst eine inzwischen geänderte Auswahl
 * überschreiben; hier übernimmt das der key über useSuccessCounter.
 */
function submitWithoutReset(action: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

/**
 * Zählt erfolgreiche Absendungen, um die Eingaben danach zurückzusetzen
 * (als key). Bei Fehlern bleiben die Eingaben stehen.
 */
function useSuccessCounter(state: FormState) {
  const [seen, setSeen] = useState(state);
  const [count, setCount] = useState(0);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setCount((c) => c + 1);
  }
  return count;
}

export function AddObjectForm({
  roomId,
  roomType,
  isPrivate,
}: {
  roomId: string;
  roomType: RoomType;
  isPrivate: boolean;
}) {
  const library = libraryFor(roomType);
  const [type, setType] = useState(library[0].type);
  const [state, action, pending] = useActionState(addObjectAction, null);
  const def = library.find((o) => o.type === type)!;
  const round = useSuccessCounter(state);

  return (
    <form onSubmit={submitWithoutReset(action)} className="flex flex-col gap-3">
      <input type="hidden" name="roomId" value={roomId} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Objekt
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-lg border-2 border-ink/30 bg-white px-3 py-2 text-base font-normal"
        >
          {library.map((o) => (
            <option key={o.type} value={o.type}>
              {o.emoji} {o.name}
            </option>
          ))}
        </select>
      </label>
      <Field
        key={`name-${type}-${round}`}
        label="Bezeichnung (optional)"
        name="name"
        placeholder={def.name}
      />
      <div>
        <p className="mb-1 text-sm font-medium">Aufgaben</p>
        <TaskPicker
          key={`${type}-${round}`}
          suggestions={suggestionsFor(type, roomType)}
          showMultiplier={!isPrivate}
        />
      </div>
      <FormMessage state={state} success="Hinzugefügt." />
      <Button type="submit" disabled={pending}>
        {def.emoji} {def.name} hinzufügen
      </Button>
    </form>
  );
}

export function AddTasksForm({
  objectId,
  suggestions,
  isPrivate,
}: {
  objectId: string;
  suggestions: TaskSuggestion[];
  isPrivate: boolean;
}) {
  const [state, action, pending] = useActionState(addTasksAction, null);
  const round = useSuccessCounter(state);
  return (
    <form onSubmit={submitWithoutReset(action)} className="flex flex-col gap-3">
      <input type="hidden" name="objectId" value={objectId} />
      <TaskPicker
        key={round}
        suggestions={
          suggestions.length > 0
            ? suggestions
            : [{ name: "", intervalDays: 7, multiplier: 1 }]
        }
        showMultiplier={!isPrivate}
      />
      <FormMessage state={state} success="Aufgaben angelegt." />
      <Button type="submit" variant="secondary" disabled={pending}>
        Aufgaben anlegen
      </Button>
    </form>
  );
}

export function SubroomForm({ parentRoomId }: { parentRoomId: string }) {
  const [state, action, pending] = useActionState(createSubroomAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="parentRoomId" value={parentRoomId} />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Typ
          <select
            name="type"
            defaultValue="bath"
            className="rounded-lg border-2 border-ink/30 bg-white px-2 py-2 text-base font-normal"
          >
            {(["bath", "wc", "kitchen", "storage", "other"] as const).map(
              (t) => (
                <option key={t} value={t}>
                  {ROOM_TYPE_LABELS[t]}
                </option>
              ),
            )}
          </select>
        </label>
        <Field
          label="Name"
          name="name"
          defaultValue="Eigenes Bad"
          required
          maxLength={40}
        />
      </div>
      <FormMessage state={state} />
      <Button type="submit" variant="secondary" disabled={pending}>
        Unterraum anlegen
      </Button>
    </form>
  );
}
