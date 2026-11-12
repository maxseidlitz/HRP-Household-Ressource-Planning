import {
  COMPOSITES,
  compositeSize,
  objectDefinition,
  type CompositeDefinition,
  type ObjectDefinition,
} from "@/catalog/objects";
import { ROOM_TYPE_LABELS, type RoomType } from "@/catalog/rooms";
import {
  autoDoors,
  rectInGrid,
  rectToTiles,
  reachableRooms,
  shiftDoors,
  shiftTiles,
  toggleDoorAt,
  type BuildRoomShape,
  type Rect,
} from "@/domain/build";
import {
  doorKey,
  footprintTiles,
  GRID_SIZE,
  rotatedSize,
  tileKey,
  tileSet,
  validDoors,
  type Door,
  type Rotation,
  type Tile,
} from "@/domain/grid";
import type { BuildState } from "@/server/queries/build";
import type { Plan } from "@/server/queries/plan";

/**
 * Zustand des Baumodus im Browser. Neue Einträge haben eine vorläufige
 * Referenz („new:…“), bis der Server die echte ID zurückgibt.
 */
export type BRoom = {
  ref: string;
  type: RoomType;
  name: string;
  tiles: Tile[];
  doors: Door[];
  ownerId: string | null;
  parentRef: string | null;
  /** Fremdes privates Zimmer: nur Umriss, Inhalt unsichtbar. */
  foreign: boolean;
};
export type BObject = {
  ref: string;
  roomRef: string;
  type: string;
  x: number;
  y: number;
  rotation: Rotation;
  placed: boolean;
  groupRef: string | null;
};
export type BGroup = { ref: string; roomRef: string; name: string };
export type Model = { rooms: BRoom[]; objects: BObject[]; groups: BGroup[] };

export type Viewer = { id: string; isAdmin: boolean };

let counter = 0;
export const newRef = () =>
  `new:${Date.now().toString(36)}${(counter++).toString(36)}`;

export function fromPlan(plan: Plan): Model {
  return {
    rooms: plan.rooms.map((r) => ({
      ref: r.id,
      type: r.type,
      name: r.name,
      tiles: r.tiles,
      doors: r.doors,
      ownerId: r.privateOwnerId,
      parentRef: r.parentRoomId,
      foreign: r.foreign,
    })),
    objects: plan.objects.map((o) => ({
      ref: o.id,
      roomRef: o.roomId,
      type: o.type,
      x: o.x,
      y: o.y,
      rotation: (o.rotation as Rotation) ?? 0,
      placed: o.placed,
      groupRef: o.groupId,
    })),
    groups: plan.groups.map((g) => ({
      ref: g.id,
      roomRef: g.roomId,
      name: g.name,
    })),
  };
}

export function toPayload(m: Model): BuildState {
  return {
    rooms: m.rooms.map((r) => ({
      ref: r.ref,
      type: r.type,
      name: r.name,
      tiles: r.tiles,
      doors: r.doors,
      ownerId: r.ownerId,
      parentRef: r.parentRef,
    })),
    objects: m.objects.map((o) => ({ ...o })),
    groups: m.groups.map((g) => ({ ...g })),
  };
}

/** Vorläufige Referenzen nach dem Speichern durch echte IDs ersetzen. */
export function applyIds<T>(value: T, ids: Record<string, string>): T {
  let json = JSON.stringify(value);
  for (const [from, to] of Object.entries(ids))
    if (from !== to && from.startsWith("new:"))
      json = json.split(`"${from}"`).join(`"${to}"`);
  return JSON.parse(json) as T;
}

// ---------- Rechte ----------
export const canOutline = (r: BRoom, v: Viewer) =>
  r.parentRef ? r.ownerId === v.id : v.isAdmin;
export const canContent = (r: BRoom, v: Viewer) =>
  r.ownerId ? r.ownerId === v.id && !r.foreign : v.isAdmin;
/** Eigene private Zimmer (für Unterräume). */
export const ownRooms = (m: Model, v: Viewer) =>
  m.rooms.filter((r) => !r.parentRef && r.ownerId === v.id);

// ---------- Geometrie ----------
const shapes = (m: Model): BuildRoomShape[] =>
  m.rooms.map((r) => ({
    id: r.ref,
    type: r.type,
    tiles: r.tiles,
    doors: r.doors,
    parentId: r.parentRef,
  }));

/** Raum an einer Kachel; Unterräume gehen vor ihrem Zimmer. */
export function roomAt(m: Model, x: number, y: number): BRoom | null {
  const k = tileKey(x, y);
  const hits = m.rooms.filter((r) =>
    r.tiles.some(([a, b]) => tileKey(a, b) === k),
  );
  return hits.find((r) => r.parentRef) ?? hits[0] ?? null;
}

const clusterOf = (m: Model, roomRef: string) =>
  m.rooms.find((r) => r.ref === roomRef)?.parentRef ?? roomRef;

export function objectAt(m: Model, x: number, y: number): BObject | null {
  for (let i = m.objects.length - 1; i >= 0; i--) {
    const o = m.objects[i];
    if (!o.placed) continue;
    if (footprint(o).some(([a, b]) => a === x && b === y)) return o;
  }
  return null;
}

export function footprint(o: BObject): Tile[] {
  const def = objectDefinition(o.type);
  return footprintTiles({
    x: o.x,
    y: o.y,
    w: def?.w ?? 1,
    h: def?.h ?? 1,
    rotation: o.rotation,
  });
}

export function objectSize(o: Pick<BObject, "type" | "rotation">) {
  const def = objectDefinition(o.type);
  return rotatedSize({ w: def?.w ?? 1, h: def?.h ?? 1, rotation: o.rotation });
}

/** Kann der Raum (bzw. sein neuer Umriss) so liegen? */
export function roomLayoutOk(
  m: Model,
  room: Pick<BRoom, "ref" | "parentRef">,
  tiles: Tile[],
): string | null {
  if (
    !tiles.every(([x, y]) => x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE)
  )
    return "Das geht über den Rand des Rasters.";
  const own = tileSet(tiles);
  if (room.parentRef) {
    const parent = m.rooms.find((r) => r.ref === room.parentRef);
    const set = tileSet(parent?.tiles ?? []);
    if ([...own].some((k) => !set.has(k)))
      return "Ein Unterraum muss im Zimmer liegen.";
    for (const s of m.rooms)
      if (
        s.parentRef === room.parentRef &&
        s.ref !== room.ref &&
        s.tiles.some(([x, y]) => own.has(tileKey(x, y)))
      )
        return `Überschneidet sich mit „${s.name}“.`;
    return null;
  }
  for (const o of m.rooms)
    if (
      !o.parentRef &&
      o.ref !== room.ref &&
      o.tiles.some(([x, y]) => own.has(tileKey(x, y)))
    )
      return `Überschneidet sich mit „${o.name}“.`;
  return null;
}

/** Passt das Möbelstück dorthin? Liefert den Raum oder einen Grund. */
export function placementOk(
  m: Model,
  v: Viewer,
  o: Pick<BObject, "type" | "x" | "y" | "rotation"> & { ref?: string },
  ignore: string[] = [],
): { ok: true; room: BRoom } | { ok: false; why: string } {
  const fp = footprint({
    ...o,
    ref: o.ref ?? "",
    roomRef: "",
    placed: true,
    groupRef: null,
  });
  if (
    !fp.length ||
    !fp.every(([x, y]) => x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE)
  )
    return { ok: false, why: "Außerhalb des Rasters." };
  const room = roomAt(m, fp[0][0], fp[0][1]);
  if (!room) return { ok: false, why: "Möbel gehören in einen Raum." };
  if (!canContent(room, v))
    return {
      ok: false,
      why: room.foreign
        ? "Privates Zimmer: einrichten kann nur die Person, der es gehört."
        : "Hier darfst du nichts einrichten.",
    };
  if (fp.some(([x, y]) => roomAt(m, x, y)?.ref !== room.ref))
    return { ok: false, why: `Muss ganz in „${room.name}“ stehen.` };
  const cluster = clusterOf(m, room.ref);
  const taken = new Set<string>();
  for (const other of m.objects)
    if (
      other.placed &&
      !ignore.includes(other.ref) &&
      other.ref !== o.ref &&
      clusterOf(m, other.roomRef) === cluster
    )
      for (const [x, y] of footprint(other)) taken.add(tileKey(x, y));
  if (fp.some(([x, y]) => taken.has(tileKey(x, y))))
    return { ok: false, why: "Da steht schon etwas." };
  return { ok: true, room };
}

// ---------- Türen ----------
function withShapes(m: Model, out: BuildRoomShape[]): Model {
  return {
    ...m,
    rooms: m.rooms.map((r, i) => ({ ...r, doors: out[i].doors })),
  };
}

/** Fehlende Türen setzen (jeder Raum erreichbar). */
export function connectRooms(m: Model): Model {
  const cleaned = m.rooms.map((r) => ({
    ...r,
    doors: validDoors(r.tiles, r.doors),
  }));
  return withShapes(
    { ...m, rooms: cleaned },
    autoDoors(shapes({ ...m, rooms: cleaned })),
  );
}

/**
 * Nach einer Änderung am Umriss: Türen des Raums und Türen anderer Räume,
 * die in seine alte Fläche führten, entfernen, dann neu verbinden.
 */
export function reconnect(m: Model, roomRef: string, oldTiles: Tile[]): Model {
  const old = tileSet(oldTiles);
  const offsets: Record<string, [number, number]> = {
    n: [0, -1],
    e: [1, 0],
    s: [0, 1],
    w: [-1, 0],
  };
  const rooms = m.rooms.map((r) => {
    if (r.ref === roomRef) return { ...r, doors: [] };
    return {
      ...r,
      doors: r.doors.filter((d) => {
        const [dx, dy] = offsets[d.side];
        return !old.has(tileKey(d.x + dx, d.y + dy));
      }),
    };
  });
  return connectRooms({ ...m, rooms });
}

export function toggleDoor(m: Model, roomRef: string, door: Door): Model {
  return withShapes(m, toggleDoorAt(shapes(m), roomRef, door));
}

export function unreachable(m: Model): BRoom[] {
  const ok = reachableRooms(shapes(m));
  return m.rooms.filter((r) => r.tiles.length && !ok.has(r.ref));
}

export const hasDoor = (r: BRoom, d: Door) =>
  r.doors.some((x) => doorKey(x) === doorKey(d));

// ---------- Aktionen ----------
export function defaultRoomName(m: Model, type: RoomType): string {
  const base = ROOM_TYPE_LABELS[type];
  const n = m.rooms.filter((r) => r.type === type).length;
  return n ? `${base} ${n + 1}` : base;
}

export function addRoom(
  m: Model,
  input: {
    type: RoomType;
    rect: Rect;
    parentRef?: string | null;
    ownerId?: string | null;
    name?: string;
  },
): { model: Model; ref: string } {
  const ref = newRef();
  const room: BRoom = {
    ref,
    type: input.type,
    name: input.name ?? defaultRoomName(m, input.type),
    tiles: rectToTiles(input.rect),
    doors: [],
    ownerId: input.ownerId ?? null,
    parentRef: input.parentRef ?? null,
    foreign: false,
  };
  return { model: connectRooms({ ...m, rooms: [...m.rooms, room] }), ref };
}

/** Raum samt Inhalt und Unterräumen verschieben. */
export function moveRoom(m: Model, ref: string, dx: number, dy: number): Model {
  const affected = new Set([
    ref,
    ...m.rooms.filter((r) => r.parentRef === ref).map((r) => r.ref),
  ]);
  const room = m.rooms.find((r) => r.ref === ref)!;
  const moved: Model = {
    ...m,
    rooms: m.rooms.map((r) =>
      affected.has(r.ref)
        ? {
            ...r,
            tiles: shiftTiles(r.tiles, dx, dy),
            doors: shiftDoors(r.doors, dx, dy),
          }
        : r,
    ),
    objects: m.objects.map((o) =>
      affected.has(o.roomRef) ? { ...o, x: o.x + dx, y: o.y + dy } : o,
    ),
  };
  return reconnect(moved, ref, room.tiles);
}

export function setRoomTiles(m: Model, ref: string, tiles: Tile[]): Model {
  const room = m.rooms.find((r) => r.ref === ref)!;
  return reconnect(
    { ...m, rooms: m.rooms.map((r) => (r.ref === ref ? { ...r, tiles } : r)) },
    ref,
    room.tiles,
  );
}

export function deleteRoom(m: Model, ref: string): Model {
  const gone = new Set([
    ref,
    ...m.rooms.filter((r) => r.parentRef === ref).map((r) => r.ref),
  ]);
  const room = m.rooms.find((r) => r.ref === ref)!;
  return reconnect(
    {
      rooms: m.rooms.filter((r) => !gone.has(r.ref)),
      objects: m.objects.filter((o) => !gone.has(o.roomRef)),
      groups: m.groups.filter((g) => !gone.has(g.roomRef)),
    },
    "",
    room.tiles,
  );
}

/** Rechteck einer Raumfläche, falls der Raum genau ein Rechteck ist. */
export function rectOf(tiles: Tile[]): Rect | null {
  if (!tiles.length) return null;
  const xs = tiles.map((t) => t[0]);
  const ys = tiles.map((t) => t[1]);
  const r = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs) + 1,
    h: Math.max(...ys) - Math.min(...ys) + 1,
  };
  return r.w * r.h === tiles.length ? r : null;
}

// ---------- Möbel ----------
export type CardItem =
  | { kind: "object"; def: ObjectDefinition }
  | { kind: "composite"; def: CompositeDefinition };

export function cardSize(c: CardItem) {
  return c.kind === "object"
    ? { w: c.def.w, h: c.def.h }
    : compositeSize(c.def);
}

/** Teile einer Karte an einer Position (bei 90° untereinander). */
export function cardParts(
  c: CardItem,
  x: number,
  y: number,
  rotation: Rotation,
) {
  if (c.kind === "object") return [{ type: c.def.type, x, y, rotation }];
  const vertical = rotation === 90 || rotation === 270;
  return c.def.parts.map((p) => ({
    type: p.type,
    x: vertical ? x : x + p.dx,
    y: vertical ? y + p.dx : y,
    rotation,
  }));
}

export function cardPlacementOk(
  m: Model,
  v: Viewer,
  c: CardItem,
  x: number,
  y: number,
  rotation: Rotation,
) {
  const parts = cardParts(c, x, y, rotation);
  let room: BRoom | null = null;
  // Teile untereinander nicht überlappen lassen: nacheinander prüfen
  let probe = m;
  for (const p of parts) {
    const res = placementOk(probe, v, p);
    if (!res.ok) return res;
    if (room && res.room.ref !== room.ref)
      return { ok: false as const, why: "Muss ganz in einem Raum stehen." };
    room = res.room;
    probe = {
      ...probe,
      objects: [
        ...probe.objects,
        {
          ...p,
          ref: newRef(),
          roomRef: res.room.ref,
          placed: true,
          groupRef: null,
        },
      ],
    };
  }
  return { ok: true as const, room: room! };
}

export function placeCard(
  m: Model,
  c: CardItem,
  roomRef: string,
  x: number,
  y: number,
  rotation: Rotation,
): { model: Model; refs: string[] } {
  const parts = cardParts(c, x, y, rotation);
  const groupRef = c.kind === "composite" ? newRef() : null;
  const objects = parts.map((p) => ({
    ...p,
    ref: newRef(),
    roomRef,
    placed: true,
    groupRef,
  }));
  return {
    model: {
      ...m,
      objects: [...m.objects, ...objects],
      groups: groupRef
        ? [...m.groups, { ref: groupRef, roomRef, name: c.def.name }]
        : m.groups,
    },
    refs: objects.map((o) => o.ref),
  };
}

/** Freien Platz für eine Karte in einem Raum suchen (erst quer, dann hochkant). */
export function findSpot(m: Model, v: Viewer, c: CardItem, room: BRoom) {
  for (const rotation of [0, 90] as Rotation[])
    for (const [x, y] of [...room.tiles].sort(
      (a, b) => a[1] - b[1] || a[0] - b[0],
    )) {
      const res = cardPlacementOk(m, v, c, x, y, rotation);
      if (res.ok && res.room.ref === room.ref) return { x, y, rotation };
    }
  return null;
}

export function catalogCards(): CardItem[] {
  return [
    ...COMPOSITES.map((def) => ({ kind: "composite" as const, def })),
    ...[
      "stove",
      "oven",
      "sink",
      "counter",
      "dishwasher",
      "fridge",
      "trash_rest",
      "trash_bio",
      "trash_yellow",
      "trash_paper",
      "trash_glass",
      "dining_table",
      "microwave",
      "pantry",
      "toilet",
      "shower",
      "bathtub",
      "washbasin",
      "mirror",
      "towel_rail",
      "sofa",
      "table",
      "plant",
      "window",
      "washing_machine",
      "drying_rack",
      "shoe_rack",
      "mailbox",
    ]
      .map((t) => objectDefinition(t))
      .filter((d): d is ObjectDefinition => Boolean(d))
      .map((def) => ({ kind: "object" as const, def })),
  ];
}

export const cardFits = (c: CardItem, type: RoomType) =>
  c.def.rooms.length === 0 || c.def.rooms.includes(type);

// ---------- Vorlagen ----------
type TemplateRoom = [RoomType, string, Rect];
export type Template = {
  id: string;
  name: string;
  description: string;
  rooms: TemplateRoom[];
  /** Möbel/Karten: [Raum-Index, Typ, x, y] relativ zum Raster. */
  items: [number, string, number, number][];
};

const O = 2; // Abstand zum Rasterrand
export const TEMPLATES: Template[] = [
  {
    id: "wg3",
    name: "3er-WG",
    description: "Flur, Küche, Bad, Wohnzimmer, Balkon und drei Zimmer",
    rooms: [
      ["kitchen", "Küche", { x: O, y: O, w: 8, h: 6 }],
      ["bath", "Bad", { x: O + 8, y: O, w: 5, h: 6 }],
      ["bedroom", "Zimmer 1", { x: O + 13, y: O, w: 6, h: 6 }],
      ["hallway", "Flur", { x: O, y: O + 6, w: 19, h: 3 }],
      ["living", "Wohnzimmer", { x: O, y: O + 9, w: 9, h: 8 }],
      ["bedroom", "Zimmer 2", { x: O + 9, y: O + 9, w: 5, h: 8 }],
      ["bedroom", "Zimmer 3", { x: O + 14, y: O + 9, w: 5, h: 8 }],
      ["balcony", "Balkon", { x: O, y: O + 17, w: 9, h: 3 }],
    ],
    items: [
      [0, "kitchenette", O, O],
      [0, "fridge", O + 6, O + 4],
      [0, "trash_rest", O, O + 5],
      [0, "trash_bio", O + 1, O + 5],
      [0, "dining_table", O + 2, O + 3],
      [1, "toilet", O + 8, O],
      [1, "shower", O + 11, O],
      [1, "washbasin", O + 8, O + 5],
      [3, "shoe_rack", O, O + 6],
      [4, "sofa", O + 1, O + 14],
      [4, "table", O + 5, O + 11],
      [4, "plant", O + 8, O + 9],
      [7, "drying_rack", O + 1, O + 18],
    ],
  },
  {
    id: "wg2",
    name: "2er-WG",
    description: "Flur, Küche, Bad, zwei Zimmer",
    rooms: [
      ["kitchen", "Küche", { x: O, y: O, w: 8, h: 6 }],
      ["bath", "Bad", { x: O + 8, y: O, w: 5, h: 6 }],
      ["hallway", "Flur", { x: O, y: O + 6, w: 13, h: 3 }],
      ["bedroom", "Zimmer 1", { x: O, y: O + 9, w: 7, h: 7 }],
      ["bedroom", "Zimmer 2", { x: O + 7, y: O + 9, w: 6, h: 7 }],
    ],
    items: [
      [0, "kitchenette", O, O],
      [0, "fridge", O + 6, O + 4],
      [0, "trash_rest", O, O + 5],
      [0, "trash_bio", O + 1, O + 5],
      [1, "toilet", O + 8, O],
      [1, "shower", O + 11, O],
      [1, "washbasin", O + 8, O + 5],
      [2, "shoe_rack", O, O + 6],
    ],
  },
  {
    id: "apt1",
    name: "1-Zimmer-Apartment",
    description: "Wohnraum, Küche, Bad, Flur",
    rooms: [
      ["living", "Wohnraum", { x: O, y: O, w: 10, h: 9 }],
      ["kitchen", "Küche", { x: O + 10, y: O, w: 7, h: 5 }],
      ["bath", "Bad", { x: O + 10, y: O + 5, w: 7, h: 4 }],
      ["hallway", "Flur", { x: O, y: O + 9, w: 17, h: 3 }],
    ],
    items: [
      [0, "sofa", O, O + 7],
      [0, "plant", O + 9, O],
      [1, "kitchenette", O + 10, O],
      [1, "trash_rest", O + 10, O + 4],
      [2, "toilet", O + 10, O + 7],
      [2, "shower", O + 15, O + 5],
      [2, "washbasin", O + 12, O + 5],
      [3, "shoe_rack", O, O + 9],
    ],
  },
];

export function applyTemplate(t: Template): Model {
  let m: Model = { rooms: [], objects: [], groups: [] };
  const refs: string[] = [];
  for (const [type, name, rect] of t.rooms) {
    if (!rectInGrid(rect)) continue;
    const res = addRoom(m, { type, name, rect });
    m = res.model;
    refs.push(res.ref);
  }
  const cards = catalogCards();
  for (const [roomIndex, type, x, y] of t.items) {
    const card = cards.find((c) => c.def.type === type);
    const roomRef = refs[roomIndex];
    if (!card || !roomRef) continue;
    m = placeCard(m, card, roomRef, x, y, 0).model;
  }
  return m;
}
