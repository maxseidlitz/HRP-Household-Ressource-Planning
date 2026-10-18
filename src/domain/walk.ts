import { tileKey, type Door, type Side, type Tile } from "./grid";

export type WalkRoom = {
  id: string;
  tiles: readonly Tile[];
  doors: readonly Door[];
  privateOwnerId: string | null;
};

const OFFSET: Record<Side, Tile> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
};
const OPPOSITE: Record<Side, Side> = { n: "s", s: "n", e: "w", w: "e" };

export type WalkGrid = {
  walkable: Set<string>;
  roomOf: Map<string, string>;
  canStep: (a: Tile, b: Tile) => boolean;
  neighbors: (t: Tile) => Tile[];
  tiles: Tile[];
};

/**
 * Begehbare Fläche für einen Avatar: Räume, die er betreten darf, ohne
 * Möbel. Zwischen Räumen geht es nur durch Türen (Spez. 12.5).
 * Unterräume liegen über ihrem Zimmer und gewinnen bei der Zuordnung.
 */
export function buildWalkGrid(input: {
  rooms: readonly (WalkRoom & { parentRoomId?: string | null })[];
  blocked: readonly Tile[];
  /** Darf dieser Raum betreten werden? */
  allowRoom: (room: WalkRoom) => boolean;
}): WalkGrid {
  const roomOf = new Map<string, string>();
  const ordered = [...input.rooms].sort(
    (a, b) => Number(Boolean(a.parentRoomId)) - Number(Boolean(b.parentRoomId)),
  );
  for (const r of ordered)
    for (const [x, y] of r.tiles) roomOf.set(tileKey(x, y), r.id);

  const allowed = new Set(input.rooms.filter(input.allowRoom).map((r) => r.id));
  const blocked = new Set(input.blocked.map(([x, y]) => tileKey(x, y)));
  const walkable = new Set<string>();
  const tiles: Tile[] = [];
  for (const [k, roomId] of roomOf) {
    if (!allowed.has(roomId) || blocked.has(k)) continue;
    walkable.add(k);
    const [x, y] = k.split(",").map(Number);
    tiles.push([x, y]);
  }

  const doors = new Set<string>();
  for (const r of input.rooms) {
    for (const d of r.doors) {
      const [dx, dy] = OFFSET[d.side];
      doors.add(`${d.x},${d.y},${d.side}`);
      doors.add(`${d.x + dx},${d.y + dy},${OPPOSITE[d.side]}`);
    }
  }

  const sideBetween = (a: Tile, b: Tile): Side | null => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
    return dx === 1 ? "e" : dx === -1 ? "w" : dy === 1 ? "s" : "n";
  };

  const canStep = (a: Tile, b: Tile) => {
    const ka = tileKey(a[0], a[1]);
    const kb = tileKey(b[0], b[1]);
    if (!walkable.has(ka) || !walkable.has(kb)) return false;
    const side = sideBetween(a, b);
    if (!side) return false;
    if (roomOf.get(ka) === roomOf.get(kb)) return true;
    return doors.has(`${a[0]},${a[1]},${side}`);
  };

  const neighbors = (t: Tile) =>
    (Object.values(OFFSET) as Tile[])
      .map(([dx, dy]) => [t[0] + dx, t[1] + dy] as Tile)
      .filter((n) => canStep(t, n));

  return { walkable, roomOf, canStep, neighbors, tiles };
}

/** A* auf dem Raster (4er-Nachbarschaft). Liefert den Weg ohne Start. */
export function findPath(
  grid: WalkGrid,
  start: Tile,
  goal: Tile,
  maxNodes = 4000,
): Tile[] | null {
  const sk = tileKey(start[0], start[1]);
  const gk = tileKey(goal[0], goal[1]);
  if (sk === gk) return [];
  if (!grid.walkable.has(gk)) return null;
  const h = (t: Tile) => Math.abs(t[0] - goal[0]) + Math.abs(t[1] - goal[1]);
  const open: { t: Tile; f: number }[] = [{ t: start, f: h(start) }];
  const g = new Map<string, number>([[sk, 0]]);
  const came = new Map<string, Tile>();
  let expanded = 0;
  while (open.length && expanded++ < maxNodes) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const { t } = open.splice(bi, 1)[0];
    const tk = tileKey(t[0], t[1]);
    if (tk === gk) {
      const path: Tile[] = [];
      let cur: Tile | undefined = t;
      while (cur && tileKey(cur[0], cur[1]) !== sk) {
        path.unshift(cur);
        cur = came.get(tileKey(cur[0], cur[1]));
      }
      return path;
    }
    for (const n of grid.neighbors(t)) {
      const nk = tileKey(n[0], n[1]);
      const ng = (g.get(tk) ?? 0) + 1;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, t);
        open.push({ t: n, f: ng + h(n) });
      }
    }
  }
  return null;
}

/**
 * Begehbare Nachbarkacheln eines Objekts (um daran zu putzen oder zu
 * stehen). Nur im selben Raum: Durch die Wand wird nicht geputzt.
 */
export function standSpots(grid: WalkGrid, footprint: readonly Tile[]): Tile[] {
  const own = new Set(footprint.map(([x, y]) => tileKey(x, y)));
  const spots = new Map<string, Tile>();
  for (const [x, y] of footprint) {
    const room = grid.roomOf.get(tileKey(x, y));
    for (const [dx, dy] of Object.values(OFFSET)) {
      const k = tileKey(x + dx, y + dy);
      if (!own.has(k) && grid.walkable.has(k) && grid.roomOf.get(k) === room) {
        spots.set(k, [x + dx, y + dy]);
      }
    }
  }
  return [...spots.values()];
}
