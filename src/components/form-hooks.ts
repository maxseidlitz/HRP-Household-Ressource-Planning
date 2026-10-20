"use client";

import { startTransition, useState } from "react";
import type { FormState } from "@/server/actions/result";

/**
 * Sendet das Formular ohne Reacts automatisches Zurücksetzen nach der
 * Aktion, damit Eingaben bei Fehlern stehen bleiben. Zurückgesetzt wird
 * nach Erfolg über den key aus useSuccessCounter. `prepare` kann die Daten
 * ergänzen oder mit `false` das Absenden abbrechen.
 */
export function submitWithoutReset(
  action: (fd: FormData) => void,
  prepare?: (fd: FormData) => boolean | void,
) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (prepare?.(fd) === false) return;
    startTransition(() => action(fd));
  };
}

/**
 * Zählt erfolgreiche Absendungen, um die Eingaben danach zurückzusetzen
 * (als key). Bei Fehlern bleiben die Eingaben stehen.
 */
export function useSuccessCounter(state: FormState<unknown>) {
  const [seen, setSeen] = useState(state);
  const [count, setCount] = useState(0);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setCount((c) => c + 1);
  }
  return count;
}
