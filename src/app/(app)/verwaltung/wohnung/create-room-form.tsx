"use client";

import { useActionState, useState } from "react";
import {
  ROOM_TYPE_EMOJI,
  ROOM_TYPE_LABELS,
  type RoomType,
} from "@/catalog/rooms";
import { FormMessage } from "@/components/form-state";
import { Button, Field, inputClass } from "@/components/ui";
import { createRoomAction } from "@/server/actions/rooms";

export function CreateRoomForm({
  members,
}: {
  members: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createRoomAction, null);
  const [type, setType] = useState<RoomType>("kitchen");
  const [name, setName] = useState(ROOM_TYPE_LABELS.kitchen);
  const [touched, setTouched] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Raumtyp</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((t) => (
            <label key={t} className="cursor-pointer">
              <input
                type="radio"
                name="type"
                value={t}
                checked={type === t}
                onChange={() => {
                  setType(t);
                  if (!touched) setName(ROOM_TYPE_LABELS[t]);
                }}
                className="peer sr-only"
              />
              <span className="flex flex-col items-center rounded-xl border border-black/10 bg-white/70 py-2 text-xs font-semibold peer-checked:border-sage peer-checked:bg-sage/10 peer-checked:ring-2 peer-checked:ring-sage/40 peer-focus-visible:ring-2">
                <span aria-hidden className="text-xl">
                  {ROOM_TYPE_EMOJI[t]}
                </span>
                {ROOM_TYPE_LABELS[t]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        label="Name"
        name="name"
        value={name}
        onChange={(e) => {
          setTouched(true);
          setName(e.target.value);
        }}
        required
        maxLength={40}
      />
      {type === "bedroom" && (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Privates Zimmer von
          <select name="privateOwnerId" className={inputClass} defaultValue="">
            <option value="">— niemandem (Gemeinschaftsraum) —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-ink/60">
            Private Zimmer richtet nur die Person selbst ein. Alle anderen, auch
            Admins, sehen nur den Umriss.
          </span>
        </label>
      )}
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        Raum anlegen
      </Button>
    </form>
  );
}
