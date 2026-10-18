import { describe, expect, it } from "vitest";
import { GRID_SIZE, rectTiles } from "./grid";
import {
  depthOf,
  isBackWall,
  mixColor,
  project,
  rotateCell,
  rotatePoint,
  rotateSide,
  shade,
  unproject,
} from "./iso";

describe("Isometrie", () => {
  it("projiziert 2:1-Rauten und lässt sich umkehren", () => {
    expect(project(1, 0)).toEqual({ x: 32, y: 16 });
    expect(project(0, 1)).toEqual({ x: -32, y: 16 });
    expect(project(0, 0, 1)).toEqual({ x: 0, y: -30 });
    const p = project(3.25, 7.5);
    const [x, y] = unproject(p.x, p.y);
    expect(x).toBeCloseTo(3.25);
    expect(y).toBeCloseTo(7.5);
  });

  it("dreht Zellen, Punkte und Seiten konsistent", () => {
    for (const k of [0, 1, 2, 3] as const) {
      const [cx, cy] = rotateCell(2, 5, k);
      const [px, py] = rotatePoint(2.5, 5.5, k);
      expect(px).toBeCloseTo(cx + 0.5);
      expect(py).toBeCloseTo(cy + 0.5);
    }
    expect(rotateCell(0, 0, 1)).toEqual([GRID_SIZE - 1, 0]);
    // Nach Norden gehen heißt nach einer Vierteldrehung nach Osten gehen.
    const a = rotateCell(4, 4, 1);
    const b = rotateCell(4, 3, 1);
    expect([b[0] - a[0], b[1] - a[1]]).toEqual([1, 0]);
    expect(rotateSide("n", 1)).toBe("e");
    expect(rotateSide("w", 3)).toBe("s");
  });

  it("zeichnet hintere Wände, vordere entfallen (Cutaway)", () => {
    expect(isBackWall("n")).toBe(true);
    expect(isBackWall("w")).toBe(true);
    expect(isBackWall("s")).toBe(false);
    expect(isBackWall("e")).toBe(false);
  });

  it("sortiert nach der vordersten Kachel", () => {
    const back = depthOf(rectTiles([0, 0], [1, 1]));
    const front = depthOf([[2, 2]]);
    expect(front).toBeGreaterThan(back);
  });

  it("mischt und schattiert Farben", () => {
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(shade(0x808080, 0.5)).toBe(0x404040);
    expect(shade(0xf0f0f0, 2)).toBe(0xffffff);
  });
});
