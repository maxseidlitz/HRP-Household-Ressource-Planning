import { GRID_SIZE, type Side, type Tile } from "./grid";

/**
 * Isometrische Projektion (Spez. 12.2): 2:1-Rauten, orthografisch.
 * Drehung in 90°-Schritten passiert vor der Projektion auf dem Raster.
 */
export const ISO_W = 64;
export const ISO_H = 32;
/** Pixel pro Höheneinheit (1 = eine Kachelbreite hoch). */
export const ISO_Z = 30;

export type ViewRotation = 0 | 1 | 2 | 3;

/** Dreht eine Rasterzelle um k × 90° im Uhrzeigersinn. */
export function rotateCell(x: number, y: number, k: ViewRotation): Tile {
  const n = GRID_SIZE - 1;
  switch (k) {
    case 1:
      return [n - y, x];
    case 2:
      return [n - x, n - y];
    case 3:
      return [y, n - x];
    default:
      return [x, y];
  }
}

/** Dreht einen Punkt in Kacheleinheiten (z. B. Kachelmitte x + 0,5). */
export function rotatePoint(
  px: number,
  py: number,
  k: ViewRotation,
): [number, number] {
  const n = GRID_SIZE;
  switch (k) {
    case 1:
      return [n - py, px];
    case 2:
      return [n - px, n - py];
    case 3:
      return [py, n - px];
    default:
      return [px, py];
  }
}

const SIDES: Side[] = ["n", "e", "s", "w"];
export function rotateSide(side: Side, k: ViewRotation): Side {
  return SIDES[(SIDES.indexOf(side) + k) % 4];
}

/** Rasterpunkt (Kacheleinheiten) und Höhe → Bildschirmkoordinaten. */
export function project(
  px: number,
  py: number,
  z = 0,
): { x: number; y: number } {
  return {
    x: ((px - py) * ISO_W) / 2,
    y: ((px + py) * ISO_H) / 2 - z * ISO_Z,
  };
}

/** Bildschirm → Rasterpunkt auf Bodenhöhe (Umkehrung von project). */
export function unproject(sx: number, sy: number): [number, number] {
  const a = sx / (ISO_W / 2);
  const b = sy / (ISO_H / 2);
  return [(a + b) / 2, (b - a) / 2];
}

/**
 * Zeichenreihenfolge: weiter hinten (kleineres x + y) zuerst. Ein Objekt
 * wird nach seiner vordersten Kachel einsortiert.
 */
export function depthOf(cells: readonly Tile[]): number {
  let best = -Infinity;
  for (const [x, y] of cells) best = Math.max(best, x + y + x * 1e-3);
  return best;
}

/**
 * Wände im Cutaway (Spez. 12.2): Nur die hinteren Wände (oben links und
 * oben rechts im Bild) werden halbhoch gezeichnet, die vorderen entfallen.
 */
export function isBackWall(rotatedSide: Side): boolean {
  return rotatedSide === "n" || rotatedSide === "w";
}

/** Höhe (in Kachelbreiten) je Objekttyp für die Voxel-Blöcke. */
const HEIGHTS: Record<string, number> = {
  fridge: 1.35,
  shower: 1.4,
  pantry: 1.15,
  oven: 0.8,
  stove: 0.8,
  counter: 0.8,
  sink: 0.8,
  dishwasher: 0.8,
  washing_machine: 0.8,
  washbasin: 0.75,
  toilet: 0.7,
  bathtub: 0.55,
  sofa: 0.6,
  dining_table: 0.6,
  table: 0.6,
  shoe_rack: 0.6,
  drying_rack: 0.9,
  plant: 0.9,
  mirror: 1.2,
  towel_rail: 1,
  window: 1.2,
  mailbox: 1,
  microwave: 0.45,
  trash_rest: 0.55,
  trash_bio: 0.55,
  trash_yellow: 0.55,
  trash_paper: 0.55,
  trash_glass: 0.55,
};

export function objectHeight(type: string): number {
  return HEIGHTS[type] ?? 0.6;
}

/** Grundfarbe je Objekttyp (Holz, Weißware, Keramik …), Spez. 12.3. */
const BASE_COLORS: Record<string, number> = {
  fridge: 0xf2f0ea,
  stove: 0xe9e5dc,
  oven: 0x5a5550,
  counter: 0xc9a777,
  sink: 0xd8dde0,
  dishwasher: 0xe9e5dc,
  washing_machine: 0xf2f0ea,
  toilet: 0xfbfbf8,
  shower: 0xbfdbe6,
  bathtub: 0xfbfbf8,
  washbasin: 0xfbfbf8,
  mirror: 0xcfe3ea,
  sofa: 0x7d97ad,
  dining_table: 0xa0784f,
  table: 0xa0784f,
  pantry: 0xb08a5e,
  plant: 0x6f9a5c,
  shoe_rack: 0x9c7a55,
  trash_rest: 0x6b6f73,
  trash_bio: 0x7a5a3a,
  trash_yellow: 0xe8c547,
  trash_paper: 0x4f78a8,
  trash_glass: 0x5f9a6a,
};

export function objectBaseColor(type: string): number {
  return BASE_COLORS[type] ?? 0xd9c7a8;
}

/** Mischt zwei RGB-Farben (t = Anteil von b). */
export function mixColor(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const m = (s: number) => Math.round(ch(a, s) * (1 - t) + ch(b, s) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

/** Hellt auf (f > 1) oder dunkelt ab (f < 1) – für die drei Würfelseiten. */
export function shade(color: number, f: number): number {
  const ch = (s: number) =>
    Math.min(255, Math.round(((color >> s) & 0xff) * f));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function hexToNumber(hex: string): number {
  return Number.parseInt(hex.replace("#", ""), 16);
}
