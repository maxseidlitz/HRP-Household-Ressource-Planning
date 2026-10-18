"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { objectEmoji } from "@/catalog/objects";
import { ROOM_TYPE_EMOJI } from "@/catalog/rooms";
import {
  GRID_SIZE,
  addTiles,
  bounds,
  doorKey,
  edgeAt,
  nextRotation,
  rectTiles,
  removeTiles,
  toggleDoor,
  validDoors,
  wallEdges,
  type Door,
  type Tile,
} from "@/domain/grid";
import {
  createGroupAction,
  deleteGroupAction,
  placeObjectAction,
  saveRoomLayoutAction,
} from "@/server/actions/plan";
import type { FormState } from "@/server/actions/result";
import type { Plan, PlanObject, PlanRoom } from "@/server/queries/plan";
import { ObjectShape, PlanSvg, TILE } from "./plan-svg";
import { useZoom, ZoomButtons } from "./zoom";

type Mode = "outline" | "doors" | "objects";
type Tool = "pan" | "add" | "erase";

const MARGIN = 4;
const MIN_SPAN = 14;

function editorViewBox(rooms: PlanRoom[]) {
  const b = bounds(rooms.flatMap((r) => r.tiles)) ?? {
    minX: 4,
    minY: 4,
    maxX: 13,
    maxY: 13,
  };
  let minX = Math.max(0, b.minX - MARGIN);
  let minY = Math.max(0, b.minY - MARGIN);
  let maxX = Math.min(GRID_SIZE - 1, b.maxX + MARGIN);
  let maxY = Math.min(GRID_SIZE - 1, b.maxY + MARGIN);
  if (maxX - minX + 1 < MIN_SPAN)
    maxX = Math.min(GRID_SIZE - 1, minX + MIN_SPAN - 1);
  if (maxY - minY + 1 < MIN_SPAN)
    maxY = Math.min(GRID_SIZE - 1, minY + MIN_SPAN - 1);
  if (maxX - minX + 1 < MIN_SPAN) minX = Math.max(0, maxX - MIN_SPAN + 1);
  if (maxY - minY + 1 < MIN_SPAN) minY = Math.max(0, maxY - MIN_SPAN + 1);
  return {
    x: minX * TILE,
    y: minY * TILE,
    w: (maxX - minX + 1) * TILE,
    h: (maxY - minY + 1) * TILE,
  };
}

const clampTile = (v: number) =>
  Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(v)));

export function PlanEditor({
  plan,
  initialRoomId,
}: {
  plan: Plan;
  initialRoomId?: string;
}) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const z = useZoom(1.5);
  const [pending, startTransition] = useTransition();

  const selectable = plan.rooms.filter(
    (r) => r.canEditOutline || r.canEditContent,
  );
  const [roomId, setRoomId] = useState(
    selectable.find((r) => r.id === initialRoomId)?.id ??
      selectable[0]?.id ??
      null,
  );
  const [mode, setMode] = useState<Mode>("outline");
  const [tool, setTool] = useState<Tool>("add");
  const [drag, setDrag] = useState<{ start: Tile; end: Tile } | null>(null);
  const [hover, setHover] = useState<Tile | null>(null);
  const [selectedObj, setSelectedObj] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [groupPick, setGroupPick] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("Einbauküche");

  // Optimistische Änderungen, bis der Server den neuen Stand liefert.
  const [layouts, setLayouts] = useState<
    Record<string, { tiles: Tile[]; doors: Door[] }>
  >({});
  const [positions, setPositions] = useState<
    Record<string, Partial<PlanObject>>
  >({});
  const [seenPlan, setSeenPlan] = useState(plan);
  if (seenPlan !== plan) {
    setSeenPlan(plan);
    setLayouts({});
    setPositions({});
  }

  const rooms = useMemo(
    () =>
      plan.rooms.map((r) => (layouts[r.id] ? { ...r, ...layouts[r.id] } : r)),
    [plan.rooms, layouts],
  );
  const objects = useMemo(
    () => plan.objects.map((o) => ({ ...o, ...positions[o.id] })),
    [plan.objects, positions],
  );
  const room = rooms.find((r) => r.id === roomId) ?? null;
  const viewBox = useMemo(() => editorViewBox(plan.rooms), [plan.rooms]);
  const roomObjects = objects.filter((o) => o.roomId === roomId);
  const selected = objects.find((o) => o.id === selectedObj) ?? null;
  const roomGroups = plan.groups.filter((g) => g.roomId === roomId);

  function run(action: () => Promise<FormState>, revert: () => void) {
    startTransition(async () => {
      const r = await action();
      if (r && !r.ok) {
        setError(r.error);
        revert();
      } else {
        setError(null);
        router.refresh();
      }
    });
  }

  function saveLayout(r: PlanRoom, tiles: Tile[], doors: Door[]) {
    const nextDoors = validDoors(tiles, doors);
    setLayouts((l) => ({ ...l, [r.id]: { tiles, doors: nextDoors } }));
    run(
      () => saveRoomLayoutAction({ roomId: r.id, tiles, doors: nextDoors }),
      () =>
        setLayouts((l) => {
          const n = { ...l };
          delete n[r.id];
          return n;
        }),
    );
  }

  function place(
    o: PlanObject,
    position: { x: number; y: number; rotation: number } | null,
  ) {
    setPositions((p) => ({
      ...p,
      [o.id]: position ? { ...position, placed: true } : { placed: false },
    }));
    run(
      () => placeObjectAction({ objectId: o.id, position }),
      () =>
        setPositions((p) => {
          const n = { ...p };
          delete n[o.id];
          return n;
        }),
    );
  }

  function pointer(
    e: React.PointerEvent | React.MouseEvent,
  ): [number, number] | null {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return [p.x / TILE, p.y / TILE];
  }

  const drawing = mode === "outline" && tool !== "pan" && room?.canEditOutline;

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!drawing) return;
    const p = pointer(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const t: Tile = [clampTile(p[0]), clampTile(p[1])];
    setDrag({ start: t, end: t });
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const p = pointer(e);
    if (!p) return;
    const t: Tile = [clampTile(p[0]), clampTile(p[1])];
    if (drag) setDrag({ ...drag, end: t });
    else if (mode === "objects") setHover(t);
  }

  function onPointerUp() {
    if (!drag || !room) return;
    const rect = rectTiles(drag.start, drag.end);
    setDrag(null);
    const tiles =
      tool === "add"
        ? addTiles(room.tiles, rect)
        : removeTiles(room.tiles, rect);
    saveLayout(room, tiles, room.doors);
  }

  function onClick(e: React.MouseEvent<SVGSVGElement>) {
    const p = pointer(e);
    if (!p || !room) return;
    if (mode === "doors" && room.canEditOutline) {
      const edge = edgeAt(p[0], p[1]);
      const isWall = wallEdges(room.tiles).some(
        (w) => doorKey(w) === doorKey(edge),
      );
      if (!isWall) {
        setError(
          "Türen kommen auf eine Wand des ausgewählten Raums. Tippe nah an die Wand.",
        );
        return;
      }
      saveLayout(room, room.tiles, toggleDoor(room.doors, edge));
      return;
    }
    if (mode === "objects") {
      const hit = (e.target as Element)
        .closest("[data-object]")
        ?.getAttribute("data-object");
      const hitObj = objects.find((o) => o.id === hit && o.roomId === roomId);
      if (hitObj && hitObj.id !== selectedObj) {
        setSelectedObj(hitObj.id);
        setRotation(hitObj.rotation);
        return;
      }
      if (selected && room.canEditContent) {
        place(selected, { x: clampTile(p[0]), y: clampTile(p[1]), rotation });
      }
    }
  }

  const preview = drag ? rectTiles(drag.start, drag.end) : [];
  const roomWalls = room && mode === "doors" ? wallEdges(room.tiles) : [];

  if (!room) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-ink/40 p-6 text-center text-sm">
        Es gibt noch keinen Raum, den du bearbeiten kannst.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Raum wählen" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2">
          {selectable.map((r) => {
            const live = rooms.find((x) => x.id === r.id)!;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  aria-pressed={r.id === roomId}
                  onClick={() => {
                    setRoomId(r.id);
                    setSelectedObj(null);
                    setGroupPick([]);
                    setError(null);
                  }}
                  className={`whitespace-nowrap rounded-full border-2 border-ink px-3 py-1 text-sm font-semibold ${r.id === roomId ? "bg-ink text-cream" : "bg-white/70"}`}
                >
                  {ROOM_TYPE_EMOJI[r.type]} {r.name}
                  {live.tiles.length === 0 && " · leer"}
                  {r.foreign && " 🔒"}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        role="tablist"
        aria-label="Bearbeiten"
        className="grid grid-cols-3 rounded-xl border-2 border-ink bg-white/60 p-1 text-sm"
      >
        {(
          [
            ["outline", "Grundriss", room.canEditOutline],
            ["doors", "Türen", room.canEditOutline],
            ["objects", "Möbel", room.canEditContent],
          ] as const
        ).map(([m, label, allowed]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            disabled={!allowed}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`rounded-lg py-1.5 font-bold disabled:opacity-40 ${mode === m ? "bg-ink text-cream" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "outline" && (
        <div className="flex gap-2" role="group" aria-label="Werkzeug">
          {(
            [
              ["add", "➕ Fläche"],
              ["erase", "➖ Radieren"],
              ["pan", "✋ Verschieben"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              aria-pressed={tool === t}
              onClick={() => setTool(t)}
              className={`flex-1 rounded-lg border-2 px-2 py-1.5 text-sm font-semibold ${tool === t ? "border-ink bg-sage/50" : "border-ink/30 bg-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-ink/70">
        {mode === "outline" &&
          (tool === "pan"
            ? "Wischen verschiebt die Ansicht."
            : `Rechteck aufziehen, um ${tool === "add" ? "Fläche hinzuzufügen" : "Fläche zu entfernen"}. L-Formen entstehen aus mehreren Rechtecken. 1 Kachel ≈ 50 cm.`)}
        {mode === "doors" &&
          "Tippe nah an eine Wand des Raums, um eine Tür zu setzen oder zu entfernen."}
        {mode === "objects" &&
          (selected
            ? `„${selected.name}“ ausgewählt: Tippe auf eine Kachel im Raum, um es dort abzustellen (obere linke Ecke).`
            : "Wähle unten ein Objekt aus und tippe dann in den Raum.")}
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-status-overdue/15 px-3 py-2 text-sm font-medium text-status-overdue"
        >
          {error}
        </p>
      )}

      <div className="relative">
        <div className="mb-2 flex justify-end">
          <ZoomButtons z={z} />
        </div>
        <div
          className="relative -mx-4 overflow-auto border-y-2 border-ink/20 bg-white"
          style={{ maxHeight: "60dvh" }}
        >
          <PlanSvg
            svgRef={svgRef}
            rooms={rooms}
            objects={objects.filter((o) => mode === "objects" || o.placed)}
            groups={plan.groups}
            viewBox={viewBox}
            selectedRoomId={roomId}
            selectedObjectId={selectedObj}
            className="block h-auto select-none"
            style={{
              width: `${z.zoom * 100}%`,
              touchAction: drawing ? "none" : "auto",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            onPointerLeave={() => setHover(null)}
            onClick={onClick}
            data-testid="plan-editor"
            data-tile={TILE}
          >
            <GridLines viewBox={viewBox} />
            {roomWalls.map((w) => (
              <WallHint key={doorKey(w)} edge={w} />
            ))}
            {preview.length > 0 && (
              <rect
                x={Math.min(drag!.start[0], drag!.end[0]) * TILE}
                y={Math.min(drag!.start[1], drag!.end[1]) * TILE}
                width={(Math.abs(drag!.end[0] - drag!.start[0]) + 1) * TILE}
                height={(Math.abs(drag!.end[1] - drag!.start[1]) + 1) * TILE}
                fill={tool === "add" ? "#8fa98a" : "#e04a3c"}
                fillOpacity={0.3}
                stroke={tool === "add" ? "#5f7a5a" : "#e04a3c"}
                strokeWidth={2}
                strokeDasharray="5 3"
                style={{ pointerEvents: "none" }}
              />
            )}
            {mode === "objects" && selected && hover && (
              <g style={{ pointerEvents: "none" }}>
                <ObjectShape
                  object={{
                    ...selected,
                    x: hover[0],
                    y: hover[1],
                    rotation,
                    placed: true,
                  }}
                  ghost
                />
              </g>
            )}
          </PlanSvg>
        </div>
        {pending && (
          <span
            className="absolute top-2 left-0 rounded bg-cream px-2 text-xs"
            role="status"
          >
            Speichern …
          </span>
        )}
      </div>

      {mode === "objects" && (
        <section aria-label="Möbel im Raum" className="flex flex-col gap-3">
          {selected && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border-2 border-ink bg-cream px-3 py-1.5 text-sm font-semibold"
                onClick={() => {
                  const r = nextRotation(rotation);
                  setRotation(r);
                  if (selected.placed)
                    place(selected, {
                      x: selected.x,
                      y: selected.y,
                      rotation: r,
                    });
                }}
              >
                ⟳ Drehen
              </button>
              {selected.placed && (
                <button
                  type="button"
                  className="rounded-lg border-2 border-ink bg-cream px-3 py-1.5 text-sm font-semibold"
                  onClick={() => place(selected, null)}
                >
                  In die Ablage
                </button>
              )}
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold underline"
                onClick={() => setSelectedObj(null)}
              >
                Auswahl aufheben
              </button>
            </div>
          )}
          {roomObjects.length === 0 ? (
            <p className="text-sm text-ink/70">
              Noch keine Objekte in diesem Raum.{" "}
              <Link
                href={`/raum/${room.id}`}
                className="font-semibold underline"
              >
                Objekte hinzufügen
              </Link>
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {roomObjects.map((o) => (
                <li key={o.id}>
                  <div
                    className={`flex items-center gap-2 rounded-xl border-2 p-2 text-sm ${o.id === selectedObj ? "border-ink bg-sage/40" : "border-ink/30 bg-white"}`}
                  >
                    <input
                      type="checkbox"
                      aria-label={`${o.name} für Gruppe auswählen`}
                      checked={groupPick.includes(o.id)}
                      onChange={(e) =>
                        setGroupPick((g) =>
                          e.target.checked
                            ? [...g, o.id]
                            : g.filter((x) => x !== o.id),
                        )
                      }
                      className="size-4 accent-[var(--sage-dark)]"
                    />
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-1 text-left"
                      aria-pressed={o.id === selectedObj}
                      onClick={() => {
                        setSelectedObj(o.id);
                        setRotation(o.rotation);
                      }}
                    >
                      <span aria-hidden>{objectEmoji(o.type)}</span>
                      <span className="truncate font-semibold">{o.name}</span>
                      {!o.placed && (
                        <span className="text-xs text-ink/60">· Ablage</span>
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {groupPick.length >= 2 && (
            <div className="flex gap-2">
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                aria-label="Name der Gruppe"
                className="min-w-0 flex-1 rounded-lg border-2 border-ink/30 bg-white px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                className="rounded-lg border-2 border-ink bg-sage px-3 py-1.5 text-sm font-semibold"
                onClick={() =>
                  run(
                    () =>
                      createGroupAction({
                        roomId: room.id,
                        name: groupName,
                        objectIds: groupPick,
                      }),
                    () => {},
                  )
                }
              >
                Gruppieren
              </button>
            </div>
          )}
          {roomGroups.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {roomGroups.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between rounded-lg bg-cream-dark px-3 py-1.5"
                >
                  <span>
                    🧩 {g.name} (
                    {objects.filter((o) => o.groupId === g.id).length} Teile)
                  </span>
                  <button
                    type="button"
                    className="text-xs font-semibold underline"
                    onClick={() =>
                      run(
                        () => deleteGroupAction(g.id),
                        () => {},
                      )
                    }
                  >
                    Auflösen
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function GridLines({
  viewBox,
}: {
  viewBox: { x: number; y: number; w: number; h: number };
}) {
  return (
    <>
      <defs>
        <pattern
          id="pat-grid"
          width={TILE}
          height={TILE}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${TILE} 0 L 0 0 0 ${TILE}`}
            fill="none"
            stroke="#2f2a24"
            strokeOpacity="0.12"
          />
        </pattern>
      </defs>
      <rect
        x={viewBox.x}
        y={viewBox.y}
        width={viewBox.w}
        height={viewBox.h}
        fill="url(#pat-grid)"
        style={{ pointerEvents: "none" }}
      />
    </>
  );
}

function WallHint({ edge }: { edge: Door }) {
  const x = edge.x * TILE;
  const y = edge.y * TILE;
  const horizontal = edge.side === "n" || edge.side === "s";
  const off = edge.side === "s" ? TILE : edge.side === "e" ? TILE : 0;
  return (
    <line
      x1={horizontal ? x + 3 : x + off}
      y1={horizontal ? y + off : y + 3}
      x2={horizontal ? x + TILE - 3 : x + off}
      y2={horizontal ? y + off : y + TILE - 3}
      stroke="#5f7a5a"
      strokeWidth={5}
      strokeOpacity={0.5}
      strokeLinecap="round"
      style={{ pointerEvents: "none" }}
    />
  );
}
