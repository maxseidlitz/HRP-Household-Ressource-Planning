"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { objectEmoji } from "@/catalog/objects";
import { TaskRow } from "@/components/task-row";
import type { Plan } from "@/server/queries/plan";
import { PlanSvg, planViewBox } from "./plan-svg";
import { useZoom, ZoomButtons } from "./zoom";

/**
 * Wohnungsplan mit Statusfarben (Spez. 12.6): Tipp auf ein Objekt öffnet
 * seine Aufgaben, unten „Als Nächstes“ mit den dringendsten Aufgaben.
 */
export function PlanViewer({ plan, nowIso }: { plan: Plan; nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const z = useZoom(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [nextOpen, setNextOpen] = useState(true);
  const viewBox = planViewBox(plan.rooms)!;

  const selectedTasks = selected
    ? plan.tasks.filter((t) => t.objectId === selected)
    : [];
  const selectedObject =
    plan.objects.find((o) => o.id === selected) ??
    (selected
      ? {
          name: "Boden",
          type: "floor",
          roomId: plan.rooms.find((r) => r.floor?.objectId === selected)?.id,
        }
      : null);
  const selectedRoom = plan.rooms.find((r) => r.id === selectedObject?.roomId);
  const next = plan.tasks.filter((t) => t.active).slice(0, 3);
  const allGreen =
    plan.tasks.length > 0 &&
    plan.tasks.every((t) => !t.active || t.status === "fresh");

  return (
    <div className="relative">
      <div className="mb-2 flex justify-end">
        <ZoomButtons z={z} />
      </div>
      <div
        className="relative -mx-4 overflow-auto bg-cream-dark/40"
        style={{ maxHeight: "calc(100dvh - 15rem)" }}
      >
        <PlanSvg
          rooms={plan.rooms}
          objects={plan.objects}
          groups={plan.groups}
          viewBox={viewBox}
          selectedObjectId={selected}
          onSelectObject={setSelected}
          onSelectFloor={setSelected}
          className="block h-auto"
          style={{ width: `${z.zoom * 100}%`, minWidth: z.zoom * 100 + "%" }}
          data-testid="plan"
        />
      </div>
      {allGreen && (
        <p
          className="mt-3 text-center font-mono text-lg font-bold"
          role="status"
        >
          ✨ Alles sauber.
        </p>
      )}

      {selected && selectedObject ? (
        <section
          aria-label={`Aufgaben: ${selectedObject.name}`}
          className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 mx-auto max-w-xl rounded-t-2xl border-2 border-b-0 border-ink bg-cream p-4 shadow-[0_-4px_0_0_rgba(47,42,36,0.15)]"
        >
          <div className="mb-3 flex items-center gap-2">
            <span aria-hidden className="text-2xl">
              {objectEmoji(selectedObject.type)}
            </span>
            <h2 className="flex-1 font-bold">
              {selectedObject.name}
              {selectedRoom && (
                <span className="font-normal text-ink/60">
                  {" "}
                  · {selectedRoom.name}
                </span>
              )}
            </h2>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-lg border-2 border-ink px-2 text-sm font-bold"
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>
          {selectedTasks.length ? (
            <ul className="flex max-h-[40dvh] flex-col gap-2 overflow-y-auto">
              {selectedTasks.map((t) => (
                <TaskRow key={t.id} task={t} now={now} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink/70">
              Keine Aufgaben.{" "}
              {selectedRoom?.canEditContent && (
                <Link
                  href={`/raum/${selectedRoom.id}`}
                  className="font-semibold underline"
                >
                  Aufgabe anlegen
                </Link>
              )}
            </p>
          )}
        </section>
      ) : (
        next.length > 0 && (
          <section
            aria-label="Als Nächstes"
            className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 mx-auto max-w-xl rounded-t-2xl border-2 border-b-0 border-ink bg-cream px-4 pt-2 pb-3"
          >
            <button
              type="button"
              onClick={() => setNextOpen((o) => !o)}
              aria-expanded={nextOpen}
              className="flex w-full items-center justify-between py-1 font-bold"
            >
              Als Nächstes
              <span aria-hidden className="text-sm">
                {nextOpen ? "▾" : "▴"}
              </span>
            </button>
            {nextOpen && (
              <ul className="mt-2 flex max-h-[26dvh] flex-col gap-2 overflow-y-auto">
                {next.map((t) => (
                  <TaskRow key={t.id} task={t} now={now} />
                ))}
              </ul>
            )}
          </section>
        )
      )}
    </div>
  );
}
