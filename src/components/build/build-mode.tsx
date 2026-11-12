"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { objectDefinition } from "@/catalog/objects";
import {
  ROOM_TYPE_EMOJI,
  ROOM_TYPE_LABELS,
  type RoomType,
} from "@/catalog/rooms";
import { rectInGrid, rectToTiles, type Rect } from "@/domain/build";
import {
  bounds,
  edgeAt,
  GRID_SIZE,
  tileKey,
  tileSet,
  wallEdges,
  type Rotation,
  type Tile,
} from "@/domain/grid";
import {
  saveBuildAction,
  setLastDoneAction,
  updateBuildTaskAction,
} from "@/server/actions/build";
import type { Plan, PlanObject, PlanRoom } from "@/server/queries/plan";
import type { TaskView } from "@/server/queries/tasks";
import { PlanSvg, TILE } from "../plan/plan-svg";
import { inputClass, segmentClass, segmentTrack } from "../ui";
import {
  addRoom,
  applyIds,
  applyTemplate,
  canContent,
  canOutline,
  cardFits,
  cardPlacementOk,
  cardParts,
  cardSize,
  catalogCards,
  deleteRoom,
  findSpot,
  fromPlan,
  moveRoom,
  objectAt,
  objectSize,
  ownRooms,
  placeCard,
  placementOk,
  rectOf,
  roomAt,
  roomLayoutOk,
  setRoomTiles,
  TEMPLATES,
  toggleDoor,
  toPayload,
  unreachable,
  type BObject,
  type BRoom,
  type CardItem,
  type Model,
  type Viewer,
} from "./model";

/**
 * Baumodus (Wohnung bauen): ein Bildschirm für Grundriss, Türen und Möbel,
 * angelehnt an den Baumodus der Sims. Änderungen landen sofort im lokalen
 * Zustand und werden kurz darauf gespeichert; jeder Schritt lässt sich
 * rückgängig machen.
 */
type Tab = "rooms" | "furniture" | "done";
type Selection = { kind: "room" | "object"; ref: string } | null;
type View = { x: number; y: number; w: number; h: number };
type Preview = {
  rects?: Rect[];
  tiles?: Tile[];
  objects?: { type: string; x: number; y: number; rotation: Rotation }[];
  ok: boolean;
  label: string;
  at: { x: number; y: number };
};
type Gesture =
  | { kind: "draw"; start: Tile; end: Tile; moved: boolean }
  | {
      kind: "moveRoom";
      ref: string;
      start: Tile;
      dx: number;
      dy: number;
      moved: boolean;
      edge: { roomRef: string; door: ReturnType<typeof edgeAt> } | null;
    }
  | {
      kind: "moveObject";
      ref: string;
      start: Tile;
      dx: number;
      dy: number;
      moved: boolean;
    }
  | {
      kind: "resize";
      ref: string;
      side: "n" | "e" | "s" | "w";
      start: Tile;
      cur: Tile;
      orig: Rect;
      moved: boolean;
    }
  | {
      kind: "pan";
      client: { x: number; y: number };
      view: View;
      moved: boolean;
    }
  | {
      kind: "pinch";
      dist: number;
      center: { x: number; y: number };
      view: View;
    }
  | { kind: "edge"; roomRef: string; door: ReturnType<typeof edgeAt> }
  | null;

const ROOM_ORDER: RoomType[] = [
  "kitchen",
  "bath",
  "living",
  "bedroom",
  "hallway",
  "wc",
  "balcony",
  "storage",
  "other",
];
const SUBROOM_ORDER: RoomType[] = ["bath", "wc", "kitchen", "storage", "other"];
const DEFAULT_ROOM = { w: 4, h: 3 };
const MIN_VIEW = 8 * TILE;
const meters = (n: number) => (n * 0.5).toLocaleString("de-DE");
const area = (tiles: number) => (tiles * 0.25).toLocaleString("de-DE");

function fitView(rooms: BRoom[], focus?: BRoom | null): View {
  const tiles = focus ? focus.tiles : rooms.flatMap((r) => r.tiles);
  const b = bounds(tiles);
  if (!b) return { x: 0, y: 0, w: 20 * TILE, h: 22 * TILE };
  const margin = focus ? 2 : 3;
  const w = Math.max(14, b.maxX - b.minX + 1 + 2 * margin) * TILE;
  const h = Math.max(14, b.maxY - b.minY + 1 + 2 * margin) * TILE;
  return {
    x: ((b.minX + b.maxX + 1) / 2) * TILE - w / 2,
    y: ((b.minY + b.maxY + 1) / 2) * TILE - h / 2,
    w,
    h,
  };
}

function clampView(v: View): View {
  const max = GRID_SIZE * TILE * 1.4;
  const w = Math.min(max, Math.max(MIN_VIEW, v.w));
  const h = (v.h / v.w) * w;
  return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
}

export function BuildMode({
  plan,
  members,
  viewer,
  focusRoomId,
}: {
  plan: Plan;
  members: { id: string; name: string }[];
  viewer: Viewer;
  focusRoomId?: string;
}) {
  const router = useRouter();
  const [model, setModel] = useState<Model>(() => fromPlan(plan));
  const modelRef = useRef(model);
  const lastSaved = useRef(model);
  const past = useRef<Model[]>([]);
  const future = useRef<Model[]>([]);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const syncHistory = () =>
    setHistory({ undo: past.current.length, redo: future.current.length });

  const [sel, setSel] = useState<Selection>(() =>
    focusRoomId && model.rooms.some((r) => r.ref === focusRoomId)
      ? { kind: "room", ref: focusRoomId }
      : null,
  );
  const [tab, setTab] = useState<Tab>(focusRoomId ? "furniture" : "rooms");
  const [pendingType, setPendingType] = useState<RoomType | null>(null);
  const [extendRef, setExtendRef] = useState<string | null>(null);
  const [filterAll, setFilterAll] = useState(false);
  const [view, setView] = useState<View>(() =>
    fitView(
      model.rooms,
      model.rooms.find((r) => r.ref === focusRoomId),
    ),
  );
  const [preview, setPreviewState] = useState<Preview | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const setPreview = (p: Preview | null) => {
    previewRef.current = p;
    setPreviewState(p);
  };
  const [status, setStatus] = useState<"saved" | "dirty" | "saving">("saved");
  const [toast, setToast] = useState<{
    text: string;
    action?: { label: string; run: () => void };
  } | null>(null);
  const [showTemplates, setShowTemplates] = useState(
    () => viewer.isAdmin && model.rooms.length === 0,
  );

  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const cardDrag = useRef<{
    card: CardItem;
    x0: number;
    y0: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const [ghost, setGhost] = useState<{
    emoji: string;
    x: number;
    y: number;
  } | null>(null);

  const owned = ownRooms(model, viewer);
  const canBuildRooms = viewer.isAdmin || owned.length > 0;
  const memberName = useCallback(
    (id: string | null) => members.find((m) => m.id === id)?.name ?? null,
    [members],
  );

  // ---------- Hinweise ----------
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const say = useCallback(
    (text: string, action?: { label: string; run: () => void }) => {
      setToast({ text, action });
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 4500);
    },
    [],
  );

  // ---------- Speichern ----------
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saving = useRef(false);
  const queued = useRef(false);
  const flush = useCallback(async () => {
    if (saving.current) {
      queued.current = true;
      return;
    }
    saving.current = true;
    do {
      queued.current = false;
      setStatus("saving");
      const sent = modelRef.current;
      const res = await saveBuildAction(toPayload(sent));
      if (res.ok) {
        const map = (m: Model) => applyIds(m, res.ids);
        lastSaved.current = map(sent);
        modelRef.current = map(modelRef.current);
        setModel(modelRef.current);
        past.current = past.current.map(map);
        future.current = future.current.map(map);
        setSel((x) => (x ? { ...x, ref: res.ids[x.ref] ?? x.ref } : x));
      } else {
        say(res.error);
        modelRef.current = lastSaved.current;
        setModel(lastSaved.current);
        future.current = [];
        setHistory({ undo: past.current.length, redo: 0 });
        setSel(null);
        queued.current = false;
      }
    } while (queued.current);
    saving.current = false;
    setStatus("saved");
  }, [say]);
  const scheduleSave = useCallback(() => {
    setStatus("dirty");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), 450);
  }, [flush]);

  const update = useCallback(
    (next: Model) => {
      past.current = [...past.current.slice(-59), modelRef.current];
      future.current = [];
      modelRef.current = next;
      setModel(next);
      setHistory({ undo: past.current.length, redo: 0 });
      scheduleSave();
    },
    [scheduleSave],
  );
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(modelRef.current);
    modelRef.current = prev;
    setModel(prev);
    setSel(null);
    scheduleSave();
    syncHistory();
  }, [scheduleSave]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(modelRef.current);
    modelRef.current = next;
    setModel(next);
    setSel(null);
    scheduleSave();
    syncHistory();
  }, [scheduleSave]);

  // Ungespeichertes nicht verlieren
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (status !== "saved") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  // ---------- Auswahl ----------
  const selRoom =
    sel?.kind === "room"
      ? (model.rooms.find((r) => r.ref === sel.ref) ?? null)
      : null;
  const selObject =
    sel?.kind === "object"
      ? (model.objects.find((o) => o.ref === sel.ref) ?? null)
      : null;
  const contextRoom =
    selRoom ??
    (selObject
      ? (model.rooms.find((r) => r.ref === selObject.roomRef) ?? null)
      : null);

  // ---------- Koordinaten ----------
  const toSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const tileOf = (p: { x: number; y: number }): Tile => [
    Math.floor(p.x / TILE),
    Math.floor(p.y / TILE),
  ];
  const norm = (a: Tile, b: Tile): Rect => ({
    x: Math.min(a[0], b[0]),
    y: Math.min(a[1], b[1]),
    w: Math.abs(a[0] - b[0]) + 1,
    h: Math.abs(a[1] - b[1]) + 1,
  });

  // ---------- Vorschau während einer Geste ----------
  function drawRect(g: Extract<Gesture, { kind: "draw" }>): Rect {
    return g.moved
      ? norm(g.start, g.end)
      : { x: g.start[0], y: g.start[1], ...DEFAULT_ROOM };
  }
  function parentFor(rect: Rect): BRoom | null {
    // Unterräume: im eigenen Zimmer (für Nicht-Admins immer)
    const tiles = rectToTiles(rect);
    return (
      owned.find((r) => {
        const set = tileSet(r.tiles);
        return tiles.every(([x, y]) => set.has(tileKey(x, y)));
      }) ?? null
    );
  }
  function evalDraw(g: Extract<Gesture, { kind: "draw" }>): Preview {
    const rect = drawRect(g);
    const label = `${meters(rect.w)} × ${meters(rect.h)} m`;
    const at = { x: rect.x + rect.w / 2, y: rect.y };
    if (!rectInGrid(rect))
      return { rects: [rect], ok: false, label: "Rand des Rasters", at };
    if (g.moved && (rect.w < 2 || rect.h < 2))
      return { rects: [rect], ok: false, label: "mind. 1 × 1 m", at };
    if (extendRef) {
      const room = model.rooms.find((r) => r.ref === extendRef)!;
      const tiles = [
        ...room.tiles,
        ...rectToTiles(rect).filter(
          ([x, y]) => !tileSet(room.tiles).has(tileKey(x, y)),
        ),
      ];
      // Noch nicht gezeichneter Raum (aus früheren Versionen): frei aufziehen
      const touches =
        !room.tiles.length ||
        rectToTiles(rect).some(([x, y]) =>
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [0, 0],
          ].some(([dx, dy]) =>
            tileSet(room.tiles).has(tileKey(x + dx, y + dy)),
          ),
        );
      const err = touches ? roomLayoutOk(model, room, tiles) : "muss angrenzen";
      return { rects: [rect], ok: !err, label: err ?? label, at };
    }
    const parent = viewer.isAdmin ? null : parentFor(rect);
    if (!viewer.isAdmin && !parent)
      return { rects: [rect], ok: false, label: "Nur im eigenen Zimmer", at };
    const err = roomLayoutOk(
      model,
      { ref: "", parentRef: parent?.ref ?? null },
      rectToTiles(rect),
    );
    return { rects: [rect], ok: !err, label: err ?? label, at };
  }
  function evalMoveRoom(g: Extract<Gesture, { kind: "moveRoom" }>): Preview {
    const room = model.rooms.find((r) => r.ref === g.ref)!;
    const tiles = room.tiles.map(([x, y]) => [x + g.dx, y + g.dy] as Tile);
    const err = roomLayoutOk(model, room, tiles);
    const b = bounds(tiles)!;
    return {
      tiles,
      ok: !err,
      label: err ?? "",
      at: { x: (b.minX + b.maxX + 1) / 2, y: b.minY },
    };
  }
  function evalMoveObject(
    g: Extract<Gesture, { kind: "moveObject" }>,
  ): Preview {
    const o = model.objects.find((x) => x.ref === g.ref)!;
    const probe = { ...o, x: o.x + g.dx, y: o.y + g.dy };
    const res = placementOk(model, viewer, probe);
    const size = objectSize(o);
    return {
      objects: [probe],
      ok: res.ok,
      label: res.ok ? res.room.name : res.why,
      at: { x: probe.x + size.w / 2, y: probe.y },
    };
  }
  function resizedRect(g: Extract<Gesture, { kind: "resize" }>): Rect {
    const r = { ...g.orig };
    const dx = g.cur[0] - g.start[0];
    const dy = g.cur[1] - g.start[1];
    if (g.side === "e") r.w = Math.max(2, r.w + dx);
    if (g.side === "s") r.h = Math.max(2, r.h + dy);
    if (g.side === "w") {
      const w = Math.max(2, r.w - dx);
      r.x += r.w - w;
      r.w = w;
    }
    if (g.side === "n") {
      const h = Math.max(2, r.h - dy);
      r.y += r.h - h;
      r.h = h;
    }
    return r;
  }
  function evalResize(g: Extract<Gesture, { kind: "resize" }>): Preview {
    const room = model.rooms.find((r) => r.ref === g.ref)!;
    const rect = resizedRect(g);
    const tiles = rectToTiles(rect);
    const set = tileSet(tiles);
    let err = rectInGrid(rect)
      ? roomLayoutOk(model, room, tiles)
      : "Rand des Rasters";
    const inside = model.objects
      .filter((o) => o.roomRef === room.ref && o.placed)
      .every((o) => objectFootprintIn(o, set));
    const children = model.rooms
      .filter((c) => c.parentRef === room.ref)
      .every((c) => c.tiles.every(([x, y]) => set.has(tileKey(x, y))));
    if (!err && !(inside && children)) err = "Möbel stünden draußen";
    return {
      rects: [rect],
      ok: !err,
      label: err ?? `${meters(rect.w)} × ${meters(rect.h)} m`,
      at: { x: rect.x + rect.w / 2, y: rect.y },
    };
  }
  const objectFootprintIn = (o: BObject, set: Set<string>) => {
    const s = objectSize(o);
    for (let x = o.x; x < o.x + s.w; x++)
      for (let y = o.y; y < o.y + s.h; y++)
        if (!set.has(tileKey(x, y))) return false;
    return true;
  };

  // ---------- Gesten im Plan ----------
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (cardDrag.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        kind: "pinch",
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view,
      };
      setPreview(null);
      return;
    }
    const p = toSvg(e.clientX, e.clientY);
    const t = tileOf(p);
    const handle = (e.target as SVGElement).dataset?.handle as
      "n" | "e" | "s" | "w" | undefined;
    if (handle && selRoom) {
      gesture.current = {
        kind: "resize",
        ref: selRoom.ref,
        side: handle,
        start: t,
        cur: t,
        orig: rectOf(selRoom.tiles)!,
        moved: false,
      };
      return;
    }
    if (pendingType || extendRef) {
      const g = { kind: "draw" as const, start: t, end: t, moved: false };
      gesture.current = g;
      setPreview(evalDraw(g));
      return;
    }
    const o = objectAt(model, t[0], t[1]);
    const oRoom = o ? model.rooms.find((r) => r.ref === o.roomRef) : null;
    if (o && oRoom && canContent(oRoom, viewer)) {
      setSel({ kind: "object", ref: o.ref });
      gesture.current = {
        kind: "moveObject",
        ref: o.ref,
        start: t,
        dx: 0,
        dy: 0,
        moved: false,
      };
      return;
    }
    // Nahe an einer Wand? Antippen setzt/entfernt dort eine Tür.
    const fx = p.x / TILE - t[0];
    const fy = p.y / TILE - t[1];
    const nearEdge = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.2;
    const room = roomAt(model, t[0], t[1]);
    let edge: { roomRef: string; door: ReturnType<typeof edgeAt> } | null =
      null;
    if (room && nearEdge && canOutline(room, viewer)) {
      const door = edgeAt(p.x / TILE, p.y / TILE);
      if (
        wallEdges(room.tiles).some(
          (w) => w.x === door.x && w.y === door.y && w.side === door.side,
        )
      )
        edge = { roomRef: room.ref, door };
    }
    if (room) {
      setSel({ kind: "room", ref: room.ref });
      gesture.current = canOutline(room, viewer)
        ? {
            kind: "moveRoom",
            ref: room.ref,
            start: t,
            dx: 0,
            dy: 0,
            moved: false,
            edge,
          }
        : edge
          ? { kind: "edge", ...edge }
          : {
              kind: "pan",
              client: { x: e.clientX, y: e.clientY },
              view,
              moved: false,
            };
      return;
    }
    setSel(null);
    gesture.current = {
      kind: "pan",
      client: { x: e.clientX, y: e.clientY },
      view,
      moved: false,
    };
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const scale = g.dist / Math.max(dist, 1);
      const rect = svgRef.current!.getBoundingClientRect();
      const ux = g.view.w / rect.width;
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const next = clampView({
        x:
          g.view.x -
          (center.x - g.center.x) * ux +
          (g.view.w - g.view.w * scale) *
            ((g.center.x - rect.left) / rect.width),
        y:
          g.view.y -
          (center.y - g.center.y) * ux +
          (g.view.h - g.view.h * scale) *
            ((g.center.y - rect.top) / rect.height),
        w: g.view.w * scale,
        h: g.view.h * scale,
      });
      setView(next);
      return;
    }
    if (g.kind === "pan") {
      const rect = svgRef.current!.getBoundingClientRect();
      const ux = g.view.w / rect.width;
      const dx = e.clientX - g.client.x;
      const dy = e.clientY - g.client.y;
      if (Math.hypot(dx, dy) > 4) g.moved = true;
      setView({ ...g.view, x: g.view.x - dx * ux, y: g.view.y - dy * ux });
      return;
    }
    const t = tileOf(toSvg(e.clientX, e.clientY));
    if (g.kind === "draw") {
      if (t[0] !== g.end[0] || t[1] !== g.end[1]) {
        g.moved = true;
        g.end = t;
      }
      setPreview(evalDraw(g));
    } else if (g.kind === "moveRoom" || g.kind === "moveObject") {
      const dx = t[0] - g.start[0];
      const dy = t[1] - g.start[1];
      if (dx || dy) g.moved = true;
      g.dx = dx;
      g.dy = dy;
      if (g.moved)
        setPreview(g.kind === "moveRoom" ? evalMoveRoom(g) : evalMoveObject(g));
    } else if (g.kind === "resize") {
      g.cur = t;
      if (t[0] !== g.start[0] || t[1] !== g.start[1]) g.moved = true;
      if (g.moved) setPreview(evalResize(g));
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    // Eine Karte aus der Leiste wird gerade abgelegt: das erledigt der
    // Dokument-Handler, die Vorschau darf hier nicht verloren gehen.
    if (cardDrag.current) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === "pinch") {
      if (pointers.current.size === 0) gesture.current = null;
      return;
    }
    gesture.current = null;
    setPreview(null);
    if (!g) return;
    if (g.kind === "draw") {
      const p = evalDraw(g);
      const rect = drawRect(g);
      if (!p.ok) {
        say(
          p.label === "muss angrenzen"
            ? "Der Anbau muss an den Raum grenzen."
            : p.label,
        );
        return;
      }
      if (extendRef) {
        const room = model.rooms.find((r) => r.ref === extendRef)!;
        const own = tileSet(room.tiles);
        const tiles = [
          ...room.tiles,
          ...rectToTiles(rect).filter(([x, y]) => !own.has(tileKey(x, y))),
        ];
        update(setRoomTiles(model, room.ref, tiles));
        setExtendRef(null);
        say(`${room.name} erweitert`);
        return;
      }
      const type = pendingType!;
      const parent = viewer.isAdmin ? null : parentFor(rect);
      const res = addRoom(model, {
        type,
        rect,
        parentRef: parent?.ref ?? null,
        ownerId: parent ? viewer.id : null,
      });
      update(res.model);
      setPendingType(null);
      setSel({ kind: "room", ref: res.ref });
      const floor = res.model.rooms.find((r) => r.ref === res.ref)!;
      say(
        `${floor.name} angelegt (${meters(rect.w)} × ${meters(rect.h)} m). Türen sind gesetzt.`,
        {
          label: "Möbel rein",
          run: () => setTab("furniture"),
        },
      );
      return;
    }
    if (g.kind === "moveRoom") {
      if (!g.moved) {
        if (g.edge) {
          const had = model.rooms
            .find((r) => r.ref === g.edge!.roomRef)!
            .doors.some(
              (d) =>
                d.x === g.edge!.door.x &&
                d.y === g.edge!.door.y &&
                d.side === g.edge!.door.side,
            );
          update(toggleDoor(model, g.edge.roomRef, g.edge.door));
          say(had ? "Tür entfernt" : "Tür gesetzt");
        }
        return;
      }
      const p = evalMoveRoom(g);
      if (p.ok) update(moveRoom(model, g.ref, g.dx, g.dy));
      else say(p.label);
      return;
    }
    if (g.kind === "edge") {
      update(toggleDoor(model, g.roomRef, g.door));
      return;
    }
    if (g.kind === "moveObject" && g.moved) {
      const p = evalMoveObject(g);
      if (!p.ok) {
        say(p.label);
        return;
      }
      const res = placementOk(model, viewer, {
        ...model.objects.find((o) => o.ref === g.ref)!,
        x: p.objects![0].x,
        y: p.objects![0].y,
      });
      update({
        ...model,
        objects: model.objects.map((o) =>
          o.ref === g.ref
            ? {
                ...o,
                x: p.objects![0].x,
                y: p.objects![0].y,
                roomRef: res.ok ? res.room.ref : o.roomRef,
              }
            : o,
        ),
      });
      return;
    }
    if (g.kind === "resize" && g.moved) {
      const p = evalResize(g);
      if (p.ok) update(setRoomTiles(model, g.ref, rectToTiles(resizedRect(g))));
      else say(p.label);
    }
  }

  // Mausrad zoomt (nicht-passiv, damit die Seite nicht scrollt)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const scale = Math.exp(e.deltaY * 0.0015);
      setView((v) => {
        const next = clampView({ ...v, w: v.w * scale, h: v.h * scale });
        const fx = (e.clientX - rect.left) / rect.width;
        const fy = (e.clientY - rect.top) / rect.height;
        return {
          ...next,
          x: v.x + (v.w - next.w) * fx,
          y: v.y + (v.h - next.h) * fy,
        };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // ---------- Karten aus der Leiste ----------
  function placeAuto(card: CardItem) {
    const editable = model.rooms.filter((r) => canContent(r, viewer));
    const preferred = [
      contextRoom && canContent(contextRoom, viewer) ? contextRoom : null,
      ...editable.filter((r) => cardFits(card, r.type)),
      ...editable,
    ].filter((r): r is BRoom => Boolean(r));
    for (const room of preferred) {
      const spot = findSpot(model, viewer, card, room);
      if (spot) {
        commitCard(card, room, spot.x, spot.y, spot.rotation);
        return;
      }
    }
    say(
      editable.length
        ? `Kein Platz mehr für: ${card.def.name}`
        : "Lege zuerst einen Raum an.",
    );
  }
  function commitCard(
    card: CardItem,
    room: BRoom,
    x: number,
    y: number,
    rotation: Rotation,
  ) {
    const res = placeCard(model, card, room.ref, x, y, rotation);
    update(res.model);
    setSel({ kind: "object", ref: res.refs[0] });
    const tasks = cardParts(card, x, y, rotation).flatMap(
      (p) => objectDefinition(p.type)?.suggestions ?? [],
    );
    say(
      tasks.length
        ? `${card.def.name} in ${room.name}: ${tasks.length === 1 ? `„${tasks[0].name}“ alle ${tasks[0].intervalDays} Tage` : `${tasks.length} Aufgaben`} angelegt`
        : `${card.def.name} in ${room.name} platziert`,
    );
  }
  function onCardPointerDown(e: React.PointerEvent, card: CardItem) {
    cardDrag.current = {
      card,
      x0: e.clientX,
      y0: e.clientY,
      moved: false,
      pointerId: e.pointerId,
    };
  }
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const c = cardDrag.current;
      if (!c || !svgRef.current) return;
      if (
        !c.moved &&
        Math.hypot(e.clientX - c.x0, e.clientY - c.y0) > 8 &&
        c.y0 - e.clientY > 6
      )
        c.moved = true;
      if (!c.moved) return;
      setGhost({ emoji: c.card.def.emoji, x: e.clientX, y: e.clientY });
      const box = svgRef.current.getBoundingClientRect();
      if (
        e.clientX < box.left ||
        e.clientX > box.right ||
        e.clientY < box.top ||
        e.clientY > box.bottom
      ) {
        setPreview(null);
        return;
      }
      const [tx, ty] = tileOf(toSvg(e.clientX, e.clientY));
      const size = cardSize(c.card);
      const x = tx - Math.floor((size.w - 1) / 2);
      const y = ty - (size.h - 1);
      const res = cardPlacementOk(modelRef.current, viewer, c.card, x, y, 0);
      setPreview({
        objects: cardParts(c.card, x, y, 0),
        ok: res.ok,
        label: res.ok ? res.room.name : res.why,
        at: { x: x + size.w / 2, y },
      });
    };
    const up = () => {
      const c = cardDrag.current;
      if (!c) return;
      cardDrag.current = null;
      setGhost(null);
      const p = previewRef.current;
      setPreview(null);
      if (!c.moved) {
        placeAuto(c.card);
        return;
      }
      if (p?.ok && p.objects) {
        const first = p.objects[0];
        const res = cardPlacementOk(
          modelRef.current,
          viewer,
          c.card,
          first.x,
          first.y,
          0,
        );
        if (res.ok) commitCard(c.card, res.room, first.x, first.y, 0);
      } else if (p) say(p.label);
    };
    const cancel = () => {
      if (cardDrag.current?.moved) setPreview(null);
      cardDrag.current = null;
      setGhost(null);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
    };
  });

  // ---------- Auswahl-Aktionen ----------
  function removeSelection() {
    if (selObject) {
      update({
        ...model,
        objects: model.objects.filter((o) => o.ref !== selObject.ref),
      });
      setSel(null);
    } else if (selRoom && canOutline(selRoom, viewer)) {
      update(deleteRoom(model, selRoom.ref));
      setSel(null);
      say(`${selRoom.name} gelöscht`, { label: "Rückgängig", run: undo });
    }
  }
  function rotateSelection() {
    if (!selObject) return;
    const rotation = ((selObject.rotation + 90) % 360) as Rotation;
    const res = placementOk(model, viewer, { ...selObject, rotation });
    if (!res.ok) {
      say("Gedreht passt es hier nicht hin.");
      return;
    }
    update({
      ...model,
      objects: model.objects.map((o) =>
        o.ref === selObject.ref ? { ...o, rotation } : o,
      ),
    });
  }
  function patchRoom(ref: string, patch: Partial<BRoom>) {
    let next: Model = {
      ...model,
      rooms: model.rooms.map((r) => (r.ref === ref ? { ...r, ...patch } : r)),
    };
    if (
      patch.ownerId !== undefined &&
      patch.ownerId &&
      patch.ownerId !== viewer.id
    ) {
      // Ab jetzt privat: der Inhalt ist für dich nicht mehr sichtbar
      const hidden = new Set([
        ref,
        ...next.rooms.filter((r) => r.parentRef === ref).map((r) => r.ref),
      ]);
      next = {
        rooms: next.rooms.map((r) =>
          r.ref === ref ? { ...r, foreign: true } : r,
        ),
        objects: next.objects.filter((o) => !hidden.has(o.roomRef)),
        groups: next.groups.filter((g) => !hidden.has(g.roomRef)),
      };
      if (sel?.kind === "object") setSel(null);
    } else if (patch.ownerId !== undefined) {
      next = {
        ...next,
        rooms: next.rooms.map((r) =>
          r.ref === ref ? { ...r, foreign: false } : r,
        ),
      };
    }
    update(next);
  }

  // ---------- Tastatur ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(
        (e.target as HTMLElement)?.tagName,
      );
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === "Escape") {
        setSel(null);
        setPendingType(null);
        setExtendRef(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && !typing)
        removeSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- Daten für die Darstellung ----------
  const tasksByObject = useMemo(() => {
    const map = new Map<string, TaskView[]>();
    for (const t of plan.tasks)
      map.set(t.objectId, [...(map.get(t.objectId) ?? []), t]);
    return map;
  }, [plan.tasks]);
  const floorTasks = (roomRef: string) =>
    plan.tasks.filter((t) => t.roomId === roomRef && t.objectType === "floor");

  const planRooms: PlanRoom[] = model.rooms.map((r) => ({
    id: r.ref,
    name: r.name,
    type: r.type,
    tiles: r.tiles,
    doors: r.doors,
    parentRoomId: r.parentRef,
    privateOwnerId: r.ownerId,
    foreign: r.foreign,
    ownerName: memberName(r.ownerId),
    canEditOutline: canOutline(r, viewer),
    canEditContent: canContent(r, viewer),
    floor: null,
  }));
  const asPlanObject = (
    o: Pick<BObject, "type" | "x" | "y" | "rotation"> & {
      ref?: string;
      roomRef?: string;
      groupRef?: string | null;
    },
  ): PlanObject => {
    const def = objectDefinition(o.type);
    return {
      id: o.ref ?? `preview-${o.type}-${o.x}-${o.y}`,
      roomId: o.roomRef ?? "",
      groupId: o.groupRef ?? null,
      type: o.type,
      name: def?.name ?? o.type,
      x: o.x,
      y: o.y,
      w: def?.w ?? 1,
      h: def?.h ?? 1,
      rotation: o.rotation,
      placed: true,
      status: "fresh",
      color: "#b8b0a2",
      progress: 0,
      taskCount: 0,
    };
  };
  const planObjects = model.objects.filter((o) => o.placed).map(asPlanObject);
  const missingDoors = unreachable(model);
  const unplaced = model.objects.filter((o) => !o.placed);
  // Erster freier Platz für einen 8 × 6 großen Raum (Hilfe für Tests/Automatisierung)
  const freeSpot = (() => {
    const taken = new Set(
      model.rooms
        .filter((r) => !r.parentRef)
        .flatMap((r) => r.tiles.map(([x, y]) => tileKey(x, y))),
    );
    for (let y = 1; y < GRID_SIZE - 6; y++)
      for (let x = 1; x < GRID_SIZE - 8; x++)
        if (
          rectToTiles({ x, y, w: 8, h: 6 }).every(
            ([a, b]) => !taken.has(tileKey(a, b)),
          )
        )
          return { x, y };
    return null;
  })();
  const undrawn = model.rooms.filter(
    (r) => !r.tiles.length && canOutline(r, viewer),
  );
  const selRect =
    selRoom && canOutline(selRoom, viewer) && !preview
      ? rectOf(selRoom.tiles)
      : null;

  const hint = extendRef
    ? model.rooms.find((r) => r.ref === extendRef)?.tiles.length
      ? `Anbau an „${model.rooms.find((r) => r.ref === extendRef)?.name}“ aufziehen (muss angrenzen).`
      : `Fläche für „${model.rooms.find((r) => r.ref === extendRef)?.name}“ aufziehen.`
    : pendingType
      ? `${ROOM_TYPE_LABELS[pendingType]}: Rechteck aufziehen oder tippen für ${meters(DEFAULT_ROOM.w)} × ${meters(DEFAULT_ROOM.h)} m.`
      : tab === "furniture"
        ? "Karte antippen stellt das Möbel automatisch auf, oder nach oben in einen Raum ziehen."
        : sel
          ? "Ziehen verschiebt, die Griffe ändern die Größe, Wand antippen setzt eine Tür."
          : viewer.isAdmin
            ? "Raum antippen zum Bearbeiten · 1 Kästchen = 50 cm · zwei Finger zoomen"
            : "Dein Zimmer antippen und einrichten · 1 Kästchen = 50 cm";

  const cards = catalogCards();
  const filterType = !filterAll ? (contextRoom?.type ?? null) : null;
  const shownCards = filterType
    ? cards.filter((c) => cardFits(c, filterType))
    : cards;
  const taskCount = plan.tasks.length;

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="build-mode"
      data-free-spot={freeSpot ? `${freeSpot.x},${freeSpot.y}` : ""}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={undo}
          disabled={!history.undo}
          aria-label="Rückgängig"
          className="glass flex size-9 items-center justify-center rounded-full disabled:opacity-40"
        >
          ↶
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!history.redo}
          aria-label="Wiederholen"
          className="glass flex size-9 items-center justify-center rounded-full disabled:opacity-40"
        >
          ↷
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">
          Wohnung bauen
        </h1>
        <span
          className="text-xs text-ink/60"
          data-testid="save-status"
          aria-live="polite"
        >
          {status === "saved" ? "Gespeichert ✓" : "Speichert …"}
        </span>
        <Link
          href="/wohnung"
          className="rounded-full bg-sage px-3.5 py-1.5 text-sm font-semibold text-white"
        >
          Fertig
        </Link>
      </div>
      <p className="min-h-5 text-sm text-ink/65">{hint}</p>

      <div
        className="relative overflow-hidden rounded-3xl border border-black/10 bg-[#f4f5f8]"
        // Plan, Leiste und Karten passen zusammen auf den Bildschirm
        style={{ height: "clamp(260px, calc(100dvh - 22rem), 640px)" }}
      >
        <PlanSvg
          svgRef={svgRef}
          rooms={planRooms}
          objects={planObjects}
          groups={model.groups.map((g) => ({
            id: g.ref,
            roomId: g.roomRef,
            name: g.name,
          }))}
          viewBox={view}
          selectedRoomId={selRoom?.ref ?? null}
          selectedObjectId={selObject?.ref ?? null}
          className="block h-full w-full select-none"
          style={{ touchAction: "none" }}
          preserveAspectRatio="xMidYMid meet"
          data-testid="plan-editor"
          data-tile={TILE}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId);
            gesture.current = null;
            setPreview(null);
          }}
        >
          {/* Raster */}
          <g
            stroke="#9aa0ad"
            strokeWidth={0.5}
            pointerEvents="none"
            opacity={0.3}
          >
            {Array.from({ length: GRID_SIZE + 1 }, (_, i) => (
              <g key={i}>
                <line
                  x1={i * TILE}
                  y1={0}
                  x2={i * TILE}
                  y2={GRID_SIZE * TILE}
                />
                <line
                  x1={0}
                  y1={i * TILE}
                  x2={GRID_SIZE * TILE}
                  y2={i * TILE}
                />
              </g>
            ))}
          </g>
          {missingDoors.map((r) => {
            const b = bounds(r.tiles)!;
            return (
              <text
                key={r.ref}
                x={((b.minX + b.maxX + 1) / 2) * TILE}
                y={(b.minY + 1.4) * TILE}
                textAnchor="middle"
                fontSize={9}
                fontWeight={700}
                fill="#ff3b30"
                pointerEvents="none"
              >
                ⚠︎ keine Tür
              </text>
            );
          })}
          {selRect &&
            (
              [
                ["n", selRect.x + selRect.w / 2, selRect.y],
                ["s", selRect.x + selRect.w / 2, selRect.y + selRect.h],
                ["w", selRect.x, selRect.y + selRect.h / 2],
                ["e", selRect.x + selRect.w, selRect.y + selRect.h / 2],
              ] as const
            ).map(([side, x, y]) => (
              <circle
                key={side}
                data-handle={side}
                data-testid={`handle-${side}`}
                cx={x * TILE}
                cy={y * TILE}
                r={8}
                fill="#fff"
                stroke="#0a84ff"
                strokeWidth={3}
                style={{
                  cursor:
                    side === "n" || side === "s" ? "ns-resize" : "ew-resize",
                }}
              />
            ))}
          {preview && (
            <g pointerEvents="none">
              {preview.rects?.map((r, i) => (
                <rect
                  key={i}
                  x={r.x * TILE}
                  y={r.y * TILE}
                  width={r.w * TILE}
                  height={r.h * TILE}
                  rx={3}
                  fill={preview.ok ? "#30c158" : "#ff3b30"}
                  fillOpacity={0.18}
                  stroke={preview.ok ? "#30c158" : "#ff3b30"}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
              ))}
              {preview.tiles?.map(([x, y]) => (
                <rect
                  key={`${x},${y}`}
                  x={x * TILE}
                  y={y * TILE}
                  width={TILE}
                  height={TILE}
                  fill={preview.ok ? "#30c158" : "#ff3b30"}
                  fillOpacity={0.22}
                />
              ))}
              {preview.objects?.map((o, i) => {
                const s = objectSize(o);
                return (
                  <g key={i}>
                    <rect
                      x={o.x * TILE + 1}
                      y={o.y * TILE + 1}
                      width={s.w * TILE - 2}
                      height={s.h * TILE - 2}
                      rx={4}
                      fill="#fff"
                      fillOpacity={0.85}
                      stroke={preview.ok ? "#30c158" : "#ff3b30"}
                      strokeWidth={2.5}
                    />
                    <text
                      x={(o.x + s.w / 2) * TILE}
                      y={(o.y + s.h / 2) * TILE}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={14}
                    >
                      {objectDefinition(o.type)?.emoji}
                    </text>
                  </g>
                );
              })}
              {preview.label && (
                <text
                  x={preview.at.x * TILE}
                  y={preview.at.y * TILE - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={preview.ok ? "#1f8a3b" : "#d70015"}
                  stroke="#f4f5f8"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {preview.label}
                </text>
              )}
            </g>
          )}
        </PlanSvg>

        <div className="absolute top-2 right-2 flex flex-col gap-1">
          {(
            [
              [
                "+",
                "Hineinzoomen",
                () =>
                  setView((v) =>
                    clampView({
                      ...v,
                      x: v.x + v.w * 0.15,
                      y: v.y + v.h * 0.15,
                      w: v.w * 0.7,
                      h: v.h * 0.7,
                    }),
                  ),
              ],
              [
                "−",
                "Herauszoomen",
                () =>
                  setView((v) =>
                    clampView({
                      ...v,
                      x: v.x - v.w * 0.2,
                      y: v.y - v.h * 0.2,
                      w: v.w * 1.4,
                      h: v.h * 1.4,
                    }),
                  ),
              ],
              [
                "⤢",
                "Ganze Wohnung zeigen",
                () => setView(fitView(model.rooms)),
              ],
            ] as const
          ).map(([label, aria, run]) => (
            <button
              key={label}
              type="button"
              onClick={run}
              aria-label={aria}
              className="glass flex size-9 items-center justify-center rounded-full text-base font-semibold text-ink/80"
            >
              {label}
            </button>
          ))}
        </div>

        {toast && (
          <div
            role="status"
            className="pointer-events-none absolute inset-x-2 top-2 z-10 mr-12 flex items-center gap-3 rounded-2xl bg-[#1c1c1e]/90 px-3 py-2 text-sm text-white shadow-glass"
            data-testid="build-toast"
          >
            <span className="flex-1">{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                className="pointer-events-auto font-semibold whitespace-nowrap text-[#64b5ff]"
                onClick={() => {
                  toast.action!.run();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}

        {(selRoom || selObject) && !preview && (
          <SelectionSheet
            key={`${selRoom?.ref ?? selObject?.ref}-${selRoom?.name ?? ""}`}
            room={selRoom}
            object={selObject}
            model={model}
            viewer={viewer}
            members={members}
            tasks={
              selObject
                ? (tasksByObject.get(selObject.ref) ?? null)
                : selRoom
                  ? floorTasks(selRoom.ref)
                  : null
            }
            extending={extendRef === selRoom?.ref}
            onClose={() => {
              setSel(null);
              setExtendRef(null);
            }}
            onPatchRoom={patchRoom}
            onExtend={() => {
              setPendingType(null);
              setExtendRef((r) => (r ? null : selRoom!.ref));
            }}
            onRotate={rotateSelection}
            onDelete={removeSelection}
            onError={say}
            onSaved={() => router.refresh()}
          />
        )}

        {ghost && (
          <div
            className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[110%] text-3xl drop-shadow-lg"
            style={{ left: ghost.x, top: ghost.y }}
          >
            {ghost.emoji}
          </div>
        )}
      </div>

      {/* Leiste */}
      <div
        className={`grid grid-cols-3 ${segmentTrack}`}
        role="tablist"
        aria-label="Baumodus"
      >
        {(
          [
            ["rooms", "Räume"],
            ["furniture", "Möbel"],
            ["done", "Fertig"],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              setPendingType(null);
              setExtendRef(null);
            }}
            className={`py-1.5 text-sm font-semibold ${segmentClass(tab === t)}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "rooms" && undrawn.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-ink/60">Noch ohne Grundriss:</span>
          {undrawn.map((r) => (
            <button
              key={r.ref}
              type="button"
              aria-pressed={extendRef === r.ref}
              onClick={() => {
                setPendingType(null);
                setSel(null);
                setExtendRef((x) => (x === r.ref ? null : r.ref));
              }}
              className={`rounded-full border px-2.5 py-1 ${extendRef === r.ref ? "border-sage bg-sage text-white" : "border-black/10 bg-white/80"}`}
            >
              {ROOM_TYPE_EMOJI[r.type]} {r.name}
            </button>
          ))}
        </div>
      )}
      {tab === "rooms" &&
        (canBuildRooms ? (
          <div
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
            role="group"
            aria-label="Raumtyp wählen"
          >
            {(viewer.isAdmin ? ROOM_ORDER : SUBROOM_ORDER).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={pendingType === t}
                onClick={() => {
                  setExtendRef(null);
                  setSel(null);
                  setPendingType((p) => (p === t ? null : t));
                }}
                data-testid={`room-card-${t}`}
                className={`flex w-20 shrink-0 flex-col items-center rounded-2xl px-1 py-2 text-center ${pendingType === t ? "bg-sage/15 ring-2 ring-sage" : "glass"}`}
              >
                <span aria-hidden className="text-2xl">
                  {ROOM_TYPE_EMOJI[t]}
                </span>
                <span className="text-xs font-semibold">
                  {ROOM_TYPE_LABELS[t]}
                </span>
                <span className="text-[11px] text-ink/55">aufziehen</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink/70">
            Den Grundriss legen die Admins an.
          </p>
        ))}

      {tab === "furniture" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              aria-pressed={!filterAll}
              onClick={() => setFilterAll(false)}
              className={`rounded-full px-3 py-1 font-medium ${!filterAll ? "bg-ink text-white" : "bg-white/70"}`}
            >
              {contextRoom ? `Für ${contextRoom.name}` : "Passend"}
            </button>
            <button
              type="button"
              aria-pressed={filterAll}
              onClick={() => setFilterAll(true)}
              className={`rounded-full px-3 py-1 font-medium ${filterAll ? "bg-ink text-white" : "bg-white/70"}`}
            >
              Alle
            </button>
          </div>
          {unplaced.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-ink/60">Noch nicht im Plan:</span>
              {unplaced.map((o) => (
                <button
                  key={o.ref}
                  type="button"
                  className="rounded-full border border-black/10 bg-white/80 px-2.5 py-1"
                  onClick={() => {
                    const def = objectDefinition(o.type);
                    const room = model.rooms.find((r) => r.ref === o.roomRef);
                    if (!def || !room) return;
                    const spot = findSpot(
                      {
                        ...model,
                        objects: model.objects.filter((x) => x.ref !== o.ref),
                      },
                      viewer,
                      { kind: "object", def },
                      room,
                    );
                    if (!spot) return say(`Kein Platz in ${room.name}.`);
                    update({
                      ...model,
                      objects: model.objects.map((x) =>
                        x.ref === o.ref ? { ...x, ...spot, placed: true } : x,
                      ),
                    });
                  }}
                >
                  {objectLabel(o.type)}
                </button>
              ))}
            </div>
          )}
          <div
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
            role="group"
            aria-label="Möbel"
          >
            {shownCards.map((c) => {
              const size = cardSize(c);
              return (
                <button
                  key={c.def.type}
                  type="button"
                  data-testid={`card-${c.def.type}`}
                  aria-label={`${c.def.name} platzieren`}
                  onPointerDown={(e) => onCardPointerDown(e, c)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      placeAuto(c);
                    }
                  }}
                  style={{ touchAction: "pan-x" }}
                  className="glass flex w-20 shrink-0 cursor-grab flex-col items-center rounded-2xl px-1 py-2 text-center select-none"
                >
                  <span aria-hidden className="text-2xl">
                    {c.def.emoji}
                  </span>
                  <span className="text-xs leading-tight font-semibold">
                    {c.def.name}
                  </span>
                  <span className="text-[11px] text-ink/55 tabular-nums">
                    {meters(size.w)} × {meters(size.h)} m
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tab === "done" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                [model.rooms.length, "Räume"],
                [model.objects.length, "Möbel"],
                [taskCount, "Aufgaben"],
              ] as const
            ).map(([n, label]) => (
              <div key={label} className="glass rounded-2xl p-2">
                <span className="block text-xl font-bold tabular-nums">
                  {n}
                </span>
                <span className="text-xs text-ink/60">{label}</span>
              </div>
            ))}
          </div>
          {missingDoors.length > 0 ? (
            <p className="text-sm text-status-overdue">
              Ohne Tür: {missingDoors.map((r) => r.name).join(", ")}. Tippe auf
              eine Wand zu einem Nachbarraum.
            </p>
          ) : (
            <p className="text-sm text-ink/70">Alle Räume sind erreichbar.</p>
          )}
          <Link
            href="/wohnung"
            className="rounded-full bg-sage px-5 py-2.5 text-center font-semibold text-white shadow-[0_4px_14px_rgb(10_132_255/0.3)]"
          >
            Fertig, zur Wohnung
          </Link>
        </div>
      )}

      {showTemplates && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/25 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Vorlage wählen"
        >
          <div className="glass-strong flex w-full max-w-md flex-col gap-3 rounded-3xl p-4">
            <h2 className="text-lg font-bold">Womit startest du?</h2>
            <p className="text-sm text-ink/70">
              Eine Vorlage spart Zeit. Danach lässt sich alles verschieben,
              vergrößern und umbenennen.
            </p>
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                className="glass flex items-center gap-3 rounded-2xl p-2 text-left"
                onClick={() => {
                  const m = applyTemplate(t);
                  update(m);
                  setView(fitView(m.rooms));
                  setShowTemplates(false);
                  say(
                    `Vorlage „${t.name}“ geladen. Zimmer lassen sich unter „Privat für“ zuweisen.`,
                  );
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-14 shrink-0 rounded-xl bg-[#f4f5f8]"
                  aria-hidden
                >
                  {t.rooms.map(([type, , r], i) => (
                    <rect
                      key={i}
                      x={r.x - 1}
                      y={r.y - 1}
                      width={r.w}
                      height={r.h}
                      fill={
                        type === "bath" || type === "wc"
                          ? "#dcf0f6"
                          : type === "kitchen"
                            ? "#e5ecfa"
                            : type === "hallway"
                              ? "#efe9df"
                              : type === "balcony"
                                ? "#e0f0dc"
                                : "#efe4d6"
                      }
                      stroke="#3a3a3c"
                      strokeWidth={0.3}
                    />
                  ))}
                </svg>
                <span>
                  <span className="block font-semibold">{t.name}</span>
                  <span className="text-sm text-ink/65">{t.description}</span>
                </span>
              </button>
            ))}
            <button
              type="button"
              className="rounded-full px-4 py-2 text-sm font-semibold text-ink/70"
              onClick={() => setShowTemplates(false)}
            >
              Leer starten und selbst zeichnen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const objectLabel = (type: string) => {
  const d = objectDefinition(type);
  return d ? `${d.emoji} ${d.name}` : type;
};

/** Sheet für den ausgewählten Raum bzw. das ausgewählte Möbel. */
function SelectionSheet({
  room,
  object,
  model,
  viewer,
  members,
  tasks,
  extending,
  onClose,
  onPatchRoom,
  onExtend,
  onRotate,
  onDelete,
  onError,
  onSaved,
}: {
  room: BRoom | null;
  object: BObject | null;
  model: Model;
  viewer: Viewer;
  members: { id: string; name: string }[];
  tasks: TaskView[] | null;
  extending: boolean;
  onClose: () => void;
  onPatchRoom: (ref: string, patch: Partial<BRoom>) => void;
  onExtend: () => void;
  onRotate: () => void;
  onDelete: () => void;
  onError: (msg: string) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(room?.name ?? "");
  const close = (
    <button
      type="button"
      onClick={onClose}
      aria-label="Auswahl aufheben"
      className="glass flex size-8 shrink-0 items-center justify-center rounded-full text-sm"
    >
      ✕
    </button>
  );
  const shell =
    "absolute inset-x-2 bottom-2 z-10 flex max-h-[55%] flex-col gap-2.5 overflow-y-auto rounded-3xl glass-strong p-3.5";

  if (room) {
    const outline = canOutline(room, viewer);
    const isPrivateTop = !room.parentRef;
    return (
      <section
        className={shell}
        aria-label={`Raum ${room.name}`}
        data-testid="room-sheet"
      >
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-2xl">
            {room.foreign ? "🔒" : ROOM_TYPE_EMOJI[room.type]}
          </span>
          {outline ? (
            <input
              aria-label="Name des Raums"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() =>
                name.trim() &&
                name.trim() !== room.name &&
                onPatchRoom(room.ref, { name: name.trim() })
              }
              onKeyDown={(e) =>
                e.key === "Enter" && (e.target as HTMLInputElement).blur()
              }
              className="min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-2 py-1 text-base font-bold focus:border-black/10 focus:bg-white/70 focus:outline-none"
            />
          ) : (
            <span className="flex-1 font-bold">{room.name}</span>
          )}
          {close}
        </div>
        <p className="text-xs text-ink/60">
          {area(room.tiles.length)} m²
          {room.foreign
            ? " · privat: Inhalt sieht nur die Person, der das Zimmer gehört"
            : tasks?.length
              ? ` · Boden: ${tasks.map((t) => `„${t.name}“ alle ${t.intervalDays} Tage`).join(", ")}`
              : ""}
        </p>
        {outline && (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-ink/60">
              Typ
              <select
                value={room.type}
                onChange={(e) =>
                  onPatchRoom(room.ref, { type: e.target.value as RoomType })
                }
                className={inputClass + " py-1.5 text-sm"}
              >
                {ROOM_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {ROOM_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            {viewer.isAdmin && isPrivateTop && (
              <label className="flex flex-col gap-1 text-xs font-medium text-ink/60">
                Privat für
                <select
                  value={room.ownerId ?? ""}
                  onChange={(e) => {
                    const owner = e.target.value || null;
                    if (
                      room.ownerId &&
                      owner !== room.ownerId &&
                      !window.confirm(
                        "Beim Wechsel wird das private Zimmer geleert. Weiter?",
                      )
                    )
                      return;
                    onPatchRoom(room.ref, { ownerId: owner });
                  }}
                  className={inputClass + " py-1.5 text-sm"}
                >
                  <option value="">Niemand (Gemeinschaft)</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        {outline && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onExtend}
              className="glass flex-1 rounded-full px-3 py-2 text-sm font-semibold"
            >
              {extending ? "Anbau abbrechen" : "Anbauen (L-Form)"}
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="glass flex-1 rounded-full px-3 py-2 text-sm font-semibold text-status-overdue"
            >
              Löschen
            </button>
          </div>
        )}
        {!outline && canContent(room, viewer) && (
          <p className="text-xs text-ink/60">
            Unten unter „Möbel“ Karten antippen oder in dein Zimmer ziehen.
          </p>
        )}
      </section>
    );
  }

  if (!object) return null;
  const objectDef = objectDefinition(object.type);
  const objRoom = model.rooms.find((r) => r.ref === object.roomRef);
  const group = object.groupRef
    ? model.groups.find((g) => g.ref === object.groupRef)
    : null;
  const neverDone = (tasks ?? []).every((t) => !t.lastCompletedAt);
  const steps = [1, 2, 3, 4, 7, 14, 30, 60, 90];
  return (
    <section
      className={shell}
      aria-label={`Möbel ${objectDef?.name}`}
      data-testid="object-sheet"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-2xl">
          {objectDef?.emoji}
        </span>
        <span className="flex-1 font-bold">
          {objectDef?.name}
          <span className="font-normal text-ink/60">
            {" "}
            · {objRoom?.name}
            {group ? ` · ${group.name}` : ""}
          </span>
        </span>
        {close}
      </div>
      {tasks === null ? (
        <p className="text-xs text-ink/60">
          {objectDef?.suggestions.length
            ? `Aufgaben werden angelegt: ${objectDef.suggestions.map((s) => s.name).join(", ")} …`
            : "Keine Aufgaben für dieses Möbel."}
        </p>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-ink/60">Keine Aufgaben für dieses Möbel.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-xl bg-white/50 px-2.5 py-1.5 text-sm"
            >
              <input
                type="checkbox"
                aria-label={`${t.name} aktiv`}
                checked={t.active}
                onChange={async (e) => {
                  const res = await updateBuildTaskAction({
                    taskId: t.id,
                    active: e.target.checked,
                  });
                  if (res.ok) onSaved();
                  else onError(res.error ?? "Fehler");
                }}
                className="size-4 accent-sage"
              />
              <span
                className={`flex-1 ${t.active ? "" : "text-ink/45 line-through"}`}
              >
                {t.name}
              </span>
              <button
                type="button"
                className="rounded-full border border-black/10 bg-white/80 px-2.5 py-0.5 text-xs font-medium tabular-nums"
                aria-label={`Intervall von ${t.name}: alle ${t.intervalDays} Tage, ändern`}
                onClick={async () => {
                  const next =
                    steps.find((s) => s > t.intervalDays) ?? steps[0];
                  const res = await updateBuildTaskAction({
                    taskId: t.id,
                    intervalDays: next,
                  });
                  if (res.ok) onSaved();
                  else onError(res.error ?? "Fehler");
                }}
              >
                alle {t.intervalDays} T
              </button>
            </li>
          ))}
        </ul>
      )}
      {tasks && tasks.length > 0 && neverDone && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-ink/60">Zuletzt gemacht?</span>
          {(
            [
              ["today", "heute"],
              ["some_days", "vor ein paar Tagen"],
              ["unknown", "weiß nicht"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="rounded-full border border-black/10 bg-white/80 px-2.5 py-1 font-medium"
              onClick={async () => {
                const res = await setLastDoneAction({
                  objectId: object.ref,
                  lastDone: value,
                });
                if (res.ok) {
                  onSaved();
                  onError(`Gespeichert: zuletzt ${label}`);
                } else onError(res.error ?? "Fehler");
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRotate}
          className="glass flex-1 rounded-full px-3 py-2 text-sm font-semibold"
        >
          ↻ Drehen
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="glass flex-1 rounded-full px-3 py-2 text-sm font-semibold text-status-overdue"
        >
          Löschen
        </button>
      </div>
    </section>
  );
}
