"use client";

import { startTransition, useActionState, useState } from "react";
import { FormMessage } from "@/components/form-state";
import { Button } from "@/components/ui";
import { createFeedbackAction } from "@/server/actions/admin";
import type { FormState } from "@/server/actions/result";

const CATEGORIES = [
  ["bug", "Bug"],
  ["idea", "Idee"],
  ["other", "Sonstiges"],
] as const;
const MAX_BYTES = 5 * 1024 * 1024;

function useSuccessCounter(state: FormState) {
  const [seen, setSeen] = useState(state);
  const [count, setCount] = useState(0);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setCount((c) => c + 1);
  }
  return count;
}

export function FeedbackForm({ screen }: { screen: string }) {
  const [state, action, pending] = useActionState(createFeedbackAction, null);
  const [tooBig, setTooBig] = useState(false);
  const round = useSuccessCounter(state);

  return (
    <form
      key={round}
      onSubmit={(e) => {
        // Eingaben bei Fehlern behalten; nach Erfolg setzt der key zurück.
        e.preventDefault();
        if (tooBig) return;
        const fd = new FormData(e.currentTarget);
        fd.set("viewport", `${window.innerWidth}×${window.innerHeight}`);
        startTransition(() => action(fd));
      }}
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
          className="rounded-xl border border-black/10 bg-white/70 px-3.5 py-2.5 text-base font-normal outline-none transition focus:border-sage focus:bg-white focus:ring-4 focus:ring-sage/15"
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
