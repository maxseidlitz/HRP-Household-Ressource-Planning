import {
  doorKey,
  GRID_SIZE,
  tileKey,
  tileSet,
  type Door,
  type Side,
  type Tile,
} from "./grid";

/**
 * Logik des Baumodus (Wohnung bauen): Türen, Erreichbarkeit, Verschieben.
 * Rein und ohne Datenbank, damit Client und Server dieselben Regeln nutzen.
 */
export type BuildRoomShape = {
  id: string;
  type: string;
  tiles: Tile[];
  doors: Door[];
  parentId: string | null;
};

export type Rect = { x: number; y: number; w: number; h: number };

const OFFSET: Record<Side, readonly [number, number]> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
};
const OPPOSITE: Record<Side, Side> = { n: "s", s: "n", e: "w", w: "e" };

export function rectToTiles(r: Rect): Tile[] {
  const out: Tile[] = [];
  for (let x = r.x; x < r.x + r.w; x++)
    for (let y = r.y; y < r.y + r.h; y++) out.push([x, y]);
  return out;
}

export function rectInGrid(r: Rect): boolean {
  return (
    r.w > 0 &&
    r.h > 0 &&
    r.x >= 0 &&
    r.y >= 0 &&
    r.x + r.w <= GRID_SIZE &&
    r.y + r.h <= GRID_SIZE
  );
}

/** Dieselbe Tür von der anderen Seite der Wand aus gesehen. */
export function doorTwin(d: Door): Door {
  const [dx, dy] = OFFSET[d.side];
  return { x: d.x + dx, y: d.y + dy, side: OPPOSITE[d.side] };
}

/** Wandkanten zwischen zwei Räumen, aus Sicht von Raum a. */
export function sharedEdges(a: readonly Tile[], b: readonly Tile[]): Door[] {
  const other = tileSet(b);
  const out: Door[] = [];
  for (const [x, y] of a)
    for (const side of ["n", "e", "s", "w"] as const) {
      const [dx, dy] = OFFSET[side];
      if (other.has(tileKey(x + dx, y + dy))) out.push({ x, y, side });
    }
  // stabile Reihenfolge, damit die „mittlere“ Kante reproduzierbar ist
  return out.sort(
    (p, q) => p.side.localeCompare(q.side) || p.x - q.x || p.y - q.y,
  );
}

/** Sind die beiden Räume durch eine Tür verbunden (auf einer der Seiten)? */
export function connected(a: BuildRoomShape, b: BuildRoomShape): boolean {
  const edges = new Set(sharedEdges(a.tiles, b.tiles).map(doorKey));
  if (a.doors.some((d) => edges.has(doorKey(d)))) return true;
  return b.doors.some((d) => edges.has(doorKey(doorTwin(d))));
}

/** Startraum für die Erreichbarkeit: Flur, sonst der erste Raum. */
function rootOf(rooms: readonly BuildRoomShape[]) {
  const top = rooms.filter((r) => !r.parentId && r.tiles.length);
  return top.find((r) => r.type === "hallway") ?? top[0] ?? null;
}

/** IDs aller Räume, die vom Startraum aus durch Türen erreichbar sind. */
export function reachableRooms(rooms: readonly BuildRoomShape[]): Set<string> {
  const root = rootOf(rooms);
  if (!root) return new Set();
  const seen = new Set([root.id]);
  const queue = [root];
  while (queue.length) {
    const r = queue.shift()!;
    for (const o of rooms)
      if (!seen.has(o.id) && o.tiles.length && connected(r, o)) {
        seen.add(o.id);
        queue.push(o);
      }
  }
  return seen;
}

/** Bevorzugte Nachbarn beim automatischen Verbinden. */
function preference(room: BuildRoomShape, neighbor: BuildRoomShape): number {
  if (room.parentId && neighbor.id === room.parentId) return 10;
  if (room.type === "balcony")
    return { living: 4, bedroom: 3 }[neighbor.type] ?? 0;
  return { hallway: 4, living: 3, kitchen: 1 }[neighbor.type] ?? 0;
}

/**
 * Setzt fehlende Türen, bis jeder Raum erreichbar ist: bevorzugt zum Flur
 * (Balkon zum Wohnzimmer, Unterräume zu ihrem Zimmer), jeweils mittig auf
 * der gemeinsamen Wand. Türen werden auf beiden Seiten gespeichert, damit
 * keine der beiden Wände sie überzeichnet. Bestehende Türen bleiben.
 */
export function autoDoors(rooms: readonly BuildRoomShape[]): BuildRoomShape[] {
  const out = rooms.map((r) => ({ ...r, doors: [...r.doors] }));
  for (;;) {
    const ok = reachableRooms(out);
    let added = false;
    for (const r of out) {
      if (ok.has(r.id) || !r.tiles.length) continue;
      const candidates = out
        .filter((n) => ok.has(n.id) && sharedEdges(r.tiles, n.tiles).length)
        .sort((p, q) => preference(r, q) - preference(r, p));
      const n = candidates[0];
      if (!n) continue;
      const edges = sharedEdges(r.tiles, n.tiles);
      const door = edges[Math.floor(edges.length / 2)];
      r.doors.push(door);
      n.doors.push(doorTwin(door));
      added = true;
      break;
    }
    if (!added) return out;
  }
}

/**
 * Tür an einer Wandkante setzen oder entfernen. Liegt auf der anderen Seite
 * ein Raum, wird die Tür dort mitgepflegt.
 */
export function toggleDoorAt(
  rooms: readonly BuildRoomShape[],
  roomId: string,
  door: Door,
): BuildRoomShape[] {
  const twin = doorTwin(door);
  const neighbor = rooms.find(
    (r) => r.id !== roomId && tileSet(r.tiles).has(tileKey(twin.x, twin.y)),
  );
  const own = rooms.find((r) => r.id === roomId);
  const has =
    own?.doors.some((d) => doorKey(d) === doorKey(door)) ||
    neighbor?.doors.some((d) => doorKey(d) === doorKey(twin));
  return rooms.map((r) => {
    if (r.id === roomId) {
      const rest = r.doors.filter((d) => doorKey(d) !== doorKey(door));
      return { ...r, doors: has ? rest : [...rest, door] };
    }
    if (neighbor && r.id === neighbor.id) {
      const rest = r.doors.filter((d) => doorKey(d) !== doorKey(twin));
      return { ...r, doors: has ? rest : [...rest, twin] };
    }
    return r;
  });
}

/** Ist b genau a, nur verschoben? Liefert die Verschiebung. */
export function translation(
  a: readonly Tile[],
  b: readonly Tile[],
): { dx: number; dy: number } | null {
  if (a.length !== b.length || a.length === 0) return null;
  const minA = a.reduce((m, t) =>
    t[0] < m[0] || (t[0] === m[0] && t[1] < m[1]) ? t : m,
  );
  const minB = b.reduce((m, t) =>
    t[0] < m[0] || (t[0] === m[0] && t[1] < m[1]) ? t : m,
  );
  const dx = minB[0] - minA[0];
  const dy = minB[1] - minA[1];
  const set = tileSet(b);
  return a.every(([x, y]) => set.has(tileKey(x + dx, y + dy)))
    ? { dx, dy }
    : null;
}

export function shiftTiles(tiles: readonly Tile[], dx: number, dy: number) {
  return tiles.map(([x, y]) => [x + dx, y + dy] as Tile);
}

export function shiftDoors(doors: readonly Door[], dx: number, dy: number) {
  return doors.map((d) => ({ ...d, x: d.x + dx, y: d.y + dy }));
}
