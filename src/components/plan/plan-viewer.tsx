"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { objectEmoji } from "@/catalog/objects";
import { IsoView, type IsoViewHandle } from "@/components/iso/iso-view";
import type { IsoAvatar } from "@/components/iso/scene";
import { TaskRow } from "@/components/task-row";
import { formatPoints } from "@/domain/points";
import type { Plan } from "@/server/queries/plan";
import type { CompleteResult } from "@/server/queries/tasks";
import { PlanSvg, planViewBox } from "./plan-svg";
import { useZoom, ZoomButtons } from "./zoom";

/**
 * Wohnungsplan mit Statusfarben (Spez. 12.6): Tipp auf ein Objekt öffnet
 * seine Aufgaben, unten „Als Nächstes“ mit den dringendsten Aufgaben.
 */
type ViewMode = "3d" | "2d";
const VIEW_KEY = "hrp-view";

/** Gewählte Ansicht pro Gerät merken (nur Komfort, darf fehlen). */
function readView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === "2d" ? "2d" : "3d";
  } catch {
    return "3d";
  }
}
function subscribeView(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

export function PlanViewer({
  plan,
  nowIso,
  avatars,
  viewerId,
}: {
  plan: Plan;
  nowIso: string;
  avatars: IsoAvatar[];
  viewerId: string;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const z = useZoom(1);
  const iso = useRef<IsoViewHandle>(null);
  const stored = useSyncExternalStore(
    subscribeView,
    readView,
    () => "3d" as const,
  );
  const [override, setOverride] = useState<ViewMode | null>(null);
  const mode = override ?? stored;
  const [isoAvailable, setIsoAvailable] = useState(true);
  const isoData = useMemo(
    () => ({ plan, avatars, viewerId }),
    [plan, avatars, viewerId],
  );

  function switchMode(m: ViewMode) {
    setOverride(m);
    try {
      localStorage.setItem(VIEW_KEY, m);
    } catch {
      // Ohne Speicher gilt die Wahl nur bis zum Neuladen.
    }
  }
  const show3d = mode === "3d" && isoAvailable;

  function onCompleted(objectId: string, r: CompleteResult) {
    if (r.duplicate) return;
    iso.current?.celebrate(
      objectId,
      r.points > 0 ? `+${formatPoints(r.points)}` : "",
    );
  }
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

  const modeToggle = (
    <div
      role="group"
      aria-label="Darstellung"
      className="flex rounded-lg border-2 border-ink bg-white/60 p-0.5 text-sm font-bold"
    >
      {(
        [
          ["3d", "3D"],
          ["2d", "2D"],
        ] as const
      ).map(([m, label]) => (
        <button
          key={m}
          type="button"
          aria-pressed={(m === "3d") === show3d}
          disabled={m === "3d" && !isoAvailable}
          onClick={() => switchMode(m)}
          className={`rounded-md px-3 py-1 disabled:opacity-40 ${(m === "3d") === show3d ? "bg-ink text-cream" : ""}`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="relative">
      {!isoAvailable && mode === "3d" && (
        <p className="mb-2 text-xs text-ink/70">
          Dieses Gerät kann die 3D-Ansicht nicht darstellen (kein WebGL), daher
          2D.
        </p>
      )}
      {show3d ? (
        <IsoView
          ref={iso}
          leading={modeToggle}
          data={isoData}
          onSelect={setSelected}
          onUnavailable={() => setIsoAvailable(false)}
        />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            {modeToggle}
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
              style={{
                width: `${z.zoom * 100}%`,
                minWidth: z.zoom * 100 + "%",
              }}
              data-testid="plan"
            />
          </div>
        </>
      )}
      <ul className="sr-only" aria-label="Objekte im Plan">
        {plan.objects
          .filter((o) => o.placed && o.taskCount > 0)
          .map((o) => (
            <li key={o.id}>
              <button type="button" onClick={() => setSelected(o.id)}>
                {o.name} öffnen
              </button>
            </li>
          ))}
      </ul>
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
                <TaskRow
                  key={t.id}
                  task={t}
                  now={now}
                  onCompleted={(r) => onCompleted(t.objectId, r)}
                />
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
                  <TaskRow
                    key={t.id}
                    task={t}
                    now={now}
                    onCompleted={(r) => onCompleted(t.objectId, r)}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      )}
    </div>
  );
}
