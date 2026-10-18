import { z } from "zod";

/**
 * Raster des Wohnungsplans (Spez. 4.1): 1 Kachel ≈ 50 cm, ein globales
 * Koordinatensystem für Editor, 2D-Plan und spätere Isometrie.
 */
export const GRID_SIZE = 40;

export type Tile = readonly [number, number];
export type Side = "n" | "e" | "s" | "w";
export type Door = { x: number; y: number; side: Side };
export type Rotation = 0 | 90 | 180 | 270;

export const tileSchema = z.tuple([
  z
    .number()
    .int()
    .min(0)
    .max(GRID_SIZE - 1),
  z
    .number()
    .int()
    .min(0)
    .max(GRID_SIZE - 1),
]);
export const doorSchema = z.object({
  x: z
    .number()
    .int()
    .min(0)
    .max(GRID_SIZE - 1),
  y: z
    .number()
    .int()
    .min(0)
    .max(GRID_SIZE - 1),
  side: z.enum(["n", "e", "s", "w"]),
});

export const tileKey = (x: number, y: number) => `${x},${y}`;

const OFFSETS: Record<Side, Tile> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
};

export function parseTiles(json: string | null | undefined): Tile[] {
  try {
    const parsed = z.array(tileSchema).safeParse(JSON.parse(json ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function parseDoors(json: string | null | undefined): Door[] {
  try {
    const parsed = z.array(doorSchema).safeParse(JSON.parse(json ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Entfernt Duplikate und sortiert (stabil für Vergleiche und Speicherung). */
export function normalizeTiles(tiles: readonly Tile[]): Tile[] {
  const seen = new Map<string, Tile>();
  for (const [x, y] of tiles) seen.set(tileKey(x, y), [x, y]);
  return [...seen.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

export function tileSet(tiles: readonly Tile[]): Set<string> {
  return new Set(tiles.map(([x, y]) => tileKey(x, y)));
}

/** Alle Kacheln des Rechtecks zwischen zwei Ecken (inklusive). */
export function rectTiles(a: Tile, b: Tile): Tile[] {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  const out: Tile[] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
}

export function addTiles(tiles: readonly Tile[], add: readonly Tile[]): Tile[] {
  return normalizeTiles([...tiles, ...add]);
}

export function removeTiles(
  tiles: readonly Tile[],
  remove: readonly Tile[],
): Tile[] {
  const r = tileSet(remove);
  return tiles.filter(([x, y]) => !r.has(tileKey(x, y)));
}

/** Zusammenhängend über Kanten (L-Formen erlaubt, Inseln nicht). */
export function isConnected(tiles: readonly Tile[]): boolean {
  if (tiles.length <= 1) return true;
  const set = tileSet(tiles);
  const seen = new Set<string>();
  const stack: Tile[] = [tiles[0]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const k = tileKey(x, y);
    if (seen.has(k)) continue;
    seen.add(k);
    for (const [dx, dy] of Object.values(OFFSETS)) {
      const nk = tileKey(x + dx, y + dy);
      if (set.has(nk) && !seen.has(nk)) stack.push([x + dx, y + dy]);
    }
  }
  return seen.size === set.size;
}

/** Wandsegmente: Kachelkanten, hinter denen keine Kachel desselben Raums liegt. */
export function wallEdges(tiles: readonly Tile[]): Door[] {
  const set = tileSet(tiles);
  const edges: Door[] = [];
  for (const [x, y] of tiles) {
    for (const side of ["n", "e", "s", "w"] as const) {
      const [dx, dy] = OFFSETS[side];
      if (!set.has(tileKey(x + dx, y + dy))) edges.push({ x, y, side });
    }
  }
  return edges;
}

export const doorKey = (d: Door) => `${d.x},${d.y},${d.side}`;

/** Behält nur Türen, die noch auf einer Wand des Raums liegen. */
export function validDoors(
  tiles: readonly Tile[],
  doors: readonly Door[],
): Door[] {
  const walls = new Set(wallEdges(tiles).map(doorKey));
  const unique = new Map(doors.map((d) => [doorKey(d), d]));
  return [...unique.values()].filter((d) => walls.has(doorKey(d)));
}

export function toggleDoor(doors: readonly Door[], door: Door): Door[] {
  const k = doorKey(door);
  return doors.some((d) => doorKey(d) === k)
    ? doors.filter((d) => doorKey(d) !== k)
    : [...doors, door];
}

/** Liegt der Punkt (in Kacheleinheiten) nahe an einer Kachelkante? */
export function edgeAt(px: number, py: number): Door {
  const x = Math.floor(px);
  const y = Math.floor(py);
  const fx = px - x;
  const fy = py - y;
  const d = { n: fy, s: 1 - fy, w: fx, e: 1 - fx };
  const side = (Object.keys(d) as Side[]).reduce((a, b) =>
    d[a] <= d[b] ? a : b,
  );
  return { x, y, side };
}

export type Footprint = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
};

/** Bei 90°/270° tauschen Breite und Tiefe. */
export function rotatedSize(o: Pick<Footprint, "w" | "h" | "rotation">) {
  const turned = o.rotation === 90 || o.rotation === 270;
  return { w: turned ? o.h : o.w, h: turned ? o.w : o.h };
}

export function footprintTiles(o: Footprint): Tile[] {
  const { w, h } = rotatedSize(o);
  if (w <= 0 || h <= 0) return [];
  return rectTiles([o.x, o.y], [o.x + w - 1, o.y + h - 1]);
}

export function nextRotation(r: number): Rotation {
  return ((r + 90) % 360) as Rotation;
}

export function bounds(tiles: readonly Tile[]) {
  if (tiles.length === 0) return null;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of tiles) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

/** Kachel für das Namensschild: die dem Schwerpunkt nächste Kachel des Raums. */
export function labelTile(tiles: readonly Tile[]): Tile | null {
  if (tiles.length === 0) return null;
  const cx = tiles.reduce((s, t) => s + t[0], 0) / tiles.length;
  const cy = tiles.reduce((s, t) => s + t[1], 0) / tiles.length;
  return tiles.reduce((best, t) =>
    Math.hypot(t[0] - cx, t[1] - cy) < Math.hypot(best[0] - cx, best[1] - cy)
      ? t
      : best,
  );
}

/**
 * Prüft einen neuen Grundriss eines Raums. Liefert eine Fehlermeldung oder
 * null.
 */
export function validateRoomLayout(input: {
  tiles: readonly Tile[];
  /** Kacheln aller Räume, mit denen sich der Raum nicht überschneiden darf. */
  blocked: readonly Tile[];
  /** Unterraum: muss vollständig im übergeordneten Zimmer liegen. */
  parentTiles?: readonly Tile[] | null;
  /** Kacheln, die belegt bleiben müssen (Unterräume, Möbel). */
  required: readonly Tile[];
}): string | null {
  const { tiles } = input;
  if (tiles.length > 0 && !isConnected(tiles)) {
    return "Ein Raum muss zusammenhängen. Für getrennte Flächen bitte einen weiteren Raum anlegen.";
  }
  const own = tileSet(tiles);
  const blocked = tileSet(input.blocked);
  if ([...own].some((k) => blocked.has(k))) {
    return "Der Raum überschneidet sich mit einem anderen Raum.";
  }
  if (input.parentTiles) {
    const parent = tileSet(input.parentTiles);
    if ([...own].some((k) => !parent.has(k))) {
      return "Ein Unterraum muss innerhalb des Zimmers liegen.";
    }
  }
  if (input.required.some(([x, y]) => !own.has(tileKey(x, y)))) {
    return "Auf diesen Kacheln stehen noch Möbel oder ein Unterraum. Bitte zuerst verschieben.";
  }
  return null;
}

/** Prüft die Position eines Möbelstücks im Raum. */
export function validatePlacement(input: {
  footprint: readonly Tile[];
  roomTiles: readonly Tile[];
  occupied: readonly Tile[];
}): string | null {
  if (input.footprint.length === 0)
    return "Dieses Objekt hat keine Grundfläche.";
  const room = tileSet(input.roomTiles);
  if (input.footprint.some(([x, y]) => !room.has(tileKey(x, y)))) {
    return "Das passt hier nicht hin: Das Objekt muss ganz im Raum stehen.";
  }
  const occupied = tileSet(input.occupied);
  if (input.footprint.some(([x, y]) => occupied.has(tileKey(x, y)))) {
    return "Dort steht schon etwas.";
  }
  return null;
}
