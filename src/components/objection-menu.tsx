"use client";

import { useActionState } from "react";
import { fileObjectionAction } from "@/server/actions/admin";
import { FormMessage } from "./form-state";

/** „…“-Menü an einer Erledigung: „Nicht erledigt“ (Spez. 6.3). */
export function ObjectionMenu({
  completionId,
  userName,
}: {
  completionId: string;
  userName: string;
}) {
  const [state, action, pending] = useActionState(fileObjectionAction, null);
  return (
    <details className="relative">
      <summary
        className="flex size-8 cursor-pointer list-none items-center justify-center rounded-lg text-lg font-bold hover:bg-cream-dark [&::-webkit-details-marker]:hidden"
        aria-label={`Optionen für die Erledigung von ${userName}`}
      >
        …
      </summary>
      <div className="absolute right-0 bottom-full z-20 mb-1 w-64 rounded-xl border-2 border-ink bg-cream p-3 shadow-[0_4px_0_0_var(--ink)]">
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="completionId" value={completionId} />
          <p className="text-xs text-ink/70">
            Stimmt nicht? Die Punkte werden eingefroren und die WG stimmt 24
            Stunden lang ab.
          </p>
          <button
            disabled={pending}
            className="rounded-lg border-2 border-ink bg-white px-3 py-1.5 text-sm font-semibold text-status-overdue"
          >
            ✋ Nicht erledigt
          </button>
          <FormMessage state={state} />
        </form>
      </div>
    </details>
  );
}
