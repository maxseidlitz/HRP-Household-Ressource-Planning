"use client";

import { useState } from "react";
import { Button } from "./ui";

/**
 * Kopiert Text. Über http gibt es keine Clipboard-API (kein Secure Context),
 * deshalb gibt es einen Fallback per execCommand und als letzte Option das
 * Markieren des Textfelds (Spez. 3.2).
 */
export function CopyField({
  value,
  label = "Link",
}: {
  value: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");

  async function copy(input: HTMLInputElement | null) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        setState("copied");
        return;
      }
    } catch {
      // weiter mit Fallback
    }
    if (input) {
      input.focus();
      input.select();
      input.setSelectionRange(0, value.length);
      try {
        if (document.execCommand("copy")) {
          setState("copied");
          return;
        }
      } catch {
        // weiter
      }
    }
    setState("manual");
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink/70">{label}</span>
      <div className="flex gap-2">
        <input
          readOnly
          value={value}
          aria-label={label}
          className="min-w-0 flex-1 rounded-lg border-2 border-ink/30 bg-white px-2 py-1.5 text-sm"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 px-3 py-1.5 text-sm"
          onClick={(e) =>
            copy(e.currentTarget.parentElement?.querySelector("input") ?? null)
          }
        >
          {state === "copied" ? "Kopiert ✓" : "Kopieren"}
        </Button>
      </div>
      {state === "manual" && (
        <span className="text-xs text-ink/70">
          Text ist markiert, bitte lange drücken und „Kopieren“ wählen.
        </span>
      )}
    </div>
  );
}
