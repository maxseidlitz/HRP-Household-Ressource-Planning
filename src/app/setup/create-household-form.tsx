"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-state";
import { Button, Field } from "@/components/ui";
import { createHouseholdAction } from "@/server/actions/household";

const EMOJIS = ["🏠", "🏡", "🌻", "🐈", "🍕", "🌈", "🚀", "🌿"];

export function CreateHouseholdForm() {
  const [state, action, pending] = useActionState(createHouseholdAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field
        label="Name der WG"
        name="name"
        placeholder="z. B. WG Sonnenallee"
        required
        minLength={2}
        maxLength={60}
      />
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Symbol</legend>
        <div className="flex flex-wrap gap-2">
          {EMOJIS.map((e, i) => (
            <label key={e} className="cursor-pointer">
              <input
                type="radio"
                name="emoji"
                value={e}
                defaultChecked={i === 0}
                className="peer sr-only"
              />
              <span className="flex size-10 items-center justify-center rounded-lg border-2 border-ink/30 bg-white text-xl peer-checked:border-ink peer-checked:bg-sage/40 peer-focus-visible:ring-2">
                {e}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        label="Wie viele wohnen in der WG?"
        name="expectedMemberCount"
        type="number"
        min={1}
        max={30}
        defaultValue={3}
        hint="Inklusive dir. Wird später für Abstimmungen gebraucht."
        required
      />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Erstellen …" : "WG erstellen"}
      </Button>
    </form>
  );
}
