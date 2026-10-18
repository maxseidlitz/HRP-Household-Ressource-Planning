"use client";

import { useState } from "react";
import type { TaskSuggestion } from "@/catalog/objects";

type Row = TaskSuggestion & { selected: boolean; custom?: boolean };

const LAST_DONE = [
  ["today", "heute"],
  ["some_days", "vor ein paar Tagen"],
  ["unknown", "weiß nicht"],
] as const;

/**
 * Vorschlagsliste mit Häkchen (Spez. 12.7 Nr. 5) plus eigene Aufgaben.
 * Felder: task.<i>.selected|name|intervalDays|multiplier|lastDone.
 */
export function TaskPicker({
  suggestions,
  showMultiplier = true,
}: {
  suggestions: TaskSuggestion[];
  showMultiplier?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    suggestions.map((s) => ({ ...s, selected: true })),
  );
  const update = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <fieldset
          key={i}
          className={`rounded-xl border-2 p-2.5 ${row.selected ? "border-ink bg-white" : "border-ink/20 bg-white/40"}`}
        >
          <legend className="sr-only">Aufgabe {row.name || i + 1}</legend>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name={`task.${i}.selected`}
              checked={row.selected}
              onChange={(e) => update(i, { selected: e.target.checked })}
              aria-label={`${row.name || "Aufgabe"} übernehmen`}
              className="size-5 accent-[var(--sage-dark)]"
            />
            <input
              name={`task.${i}.name`}
              value={row.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="Name der Aufgabe"
              aria-label="Name der Aufgabe"
              className="min-w-0 flex-1 rounded-md border border-ink/20 px-2 py-1 font-semibold"
            />
          </div>
          {row.selected && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <label className="flex flex-col gap-0.5">
                alle … Tage
                <input
                  type="number"
                  name={`task.${i}.intervalDays`}
                  value={row.intervalDays}
                  min={0.5}
                  max={365}
                  step={0.5}
                  onChange={(e) =>
                    update(i, { intervalDays: Number(e.target.value) })
                  }
                  className="rounded-md border border-ink/20 px-2 py-1 text-sm"
                />
              </label>
              {showMultiplier ? (
                <label className="flex flex-col gap-0.5">
                  Aufwand ×
                  <input
                    type="number"
                    name={`task.${i}.multiplier`}
                    value={row.multiplier}
                    min={0.5}
                    max={5}
                    step={0.5}
                    onChange={(e) =>
                      update(i, { multiplier: Number(e.target.value) })
                    }
                    className="rounded-md border border-ink/20 px-2 py-1 text-sm"
                  />
                </label>
              ) : (
                <input type="hidden" name={`task.${i}.multiplier`} value={1} />
              )}
              <label className="col-span-2 flex flex-col gap-0.5">
                Zuletzt gemacht?
                <select
                  name={`task.${i}.lastDone`}
                  defaultValue="unknown"
                  className="rounded-md border border-ink/20 bg-white px-2 py-1 text-sm"
                >
                  {LAST_DONE.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </fieldset>
      ))}
      <button
        type="button"
        onClick={() =>
          setRows((r) => [
            ...r,
            {
              name: "",
              intervalDays: 7,
              multiplier: 1,
              selected: true,
              custom: true,
            },
          ])
        }
        className="self-start text-sm font-semibold underline"
      >
        + Eigene Aufgabe
      </button>
    </div>
  );
}
