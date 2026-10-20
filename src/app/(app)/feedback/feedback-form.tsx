"use client";

import { useActionState, useState } from "react";
import { submitWithoutReset, useSuccessCounter } from "@/components/form-hooks";
import { FormMessage } from "@/components/form-state";
import { Button, inputClass } from "@/components/ui";
import { createFeedbackAction } from "@/server/actions/admin";

const CATEGORIES = [
  ["bug", "Bug"],
  ["idea", "Idee"],
  ["other", "Sonstiges"],
] as const;
const MAX_BYTES = 5 * 1024 * 1024;

export function FeedbackForm({ screen }: { screen: string }) {
  const [state, action, pending] = useActionState(createFeedbackAction, null);
  const [tooBig, setTooBig] = useState(false);
  const round = useSuccessCounter(state);

  return (
    <form
      key={round}
      onSubmit={submitWithoutReset(action, (fd) => {
        if (tooBig) return false;
        fd.set("viewport", `${window.innerWidth}×${window.innerHeight}`);
      })}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="screen" value={screen} />
      <fieldset className="flex gap-2">
        <legend className="mb-1 text-sm font-medium">Worum geht’s?</legend>
        {CATEGORIES.map(([value, label], i) => (
          <label
            key={value}
            className="flex-1 cursor-pointer rounded-full glass px-2 py-2 text-center text-sm font-semibold has-checked:bg-ink has-checked:text-white"
          >
            <input
              type="radio"
              name="category"
              value={value}
              defaultChecked={i === 0}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Beschreibung
        <textarea
          name="text"
          required
          rows={5}
          maxLength={4000}
          placeholder="Was ist passiert, was hast du erwartet?"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Screenshot (optional, max. 5 MB)
        <input
          type="file"
          name="screenshot"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={(e) =>
            setTooBig((e.target.files?.[0]?.size ?? 0) > MAX_BYTES)
          }
          className="text-sm font-normal"
        />
      </label>
      {tooBig && (
        <p role="alert" className="text-sm font-medium text-status-overdue">
          Der Screenshot ist größer als 5 MB.
        </p>
      )}
      <p className="text-xs text-ink/60">
        Mitgeschickt werden die aktuelle Seite ({screen || "–"}), dein Gerät und
        Browser sowie der Zeitpunkt.
      </p>
      <Button disabled={pending || tooBig}>Feedback senden</Button>
      <FormMessage
        state={state}
        success="Danke! Dein Feedback ist angekommen."
      />
    </form>
  );
}
