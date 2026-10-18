import { describe, expect, it } from "vitest";
import { rectTiles } from "./grid";
import { buildWalkGrid, findPath, standSpots } from "./walk";
import { initialAvatar, seededRng, sendToClean, stepAvatar } from "./avatar-ai";

// Küche (0..3 × 0..2) und Bad (4..6 × 0..2), Tür zwischen (3,1) und (4,1).
// Annas Zimmer (0..3 × 3..5) privat, Tür von der Küche aus bei (1,2) Süd.
const kitchen = {
  id: "k",
  tiles: rectTiles([0, 0], [3, 2]),
  doors: [{ x: 3, y: 1, side: "e" as const }],
  privateOwnerId: null,
};
const bath = {
  id: "b",
  tiles: rectTiles([4, 0], [6, 2]),
  doors: [],
  privateOwnerId: null,
};
const annas = {
  id: "a",
  tiles: rectTiles([0, 3], [3, 5]),
  doors: [{ x: 1, y: 3, side: "n" as const }],
  privateOwnerId: "anna",
};
const rooms = [kitchen, bath, annas];

const grid = (who: string | null, blocked = [] as [number, number][]) =>
  buildWalkGrid({
    rooms,
    blocked,
    allowRoom: (r) => !r.privateOwnerId || r.privateOwnerId === who,
  });

describe("Begehbarkeit", () => {
  it("geht nur durch Türen von Raum zu Raum", () => {
    const g = grid(null);
    expect(g.canStep([3, 1], [4, 1])).toBe(true);
    expect(g.canStep([3, 0], [4, 0])).toBe(false); // Wand
    expect(g.canStep([4, 1], [3, 1])).toBe(true); // Tür in beide Richtungen
  });

  it("lässt nur die Besitzerin in ihr privates Zimmer", () => {
    expect(grid(null).walkable.has("1,4")).toBe(false);
    expect(grid("anna").walkable.has("1,4")).toBe(true);
    expect(grid("anna").canStep([1, 2], [1, 3])).toBe(true);
  });

  it("findet Wege um Möbel herum und durch Türen", () => {
    const g = grid(null, [
      [2, 1],
      [2, 0],
    ]);
    const path = findPath(g, [0, 1], [5, 1])!;
    expect(path.at(-1)).toEqual([5, 1]);
    expect(path).not.toContainEqual([2, 1]);
    expect(path).toContainEqual([4, 1]);
    for (let i = 1; i < path.length; i++)
      expect(g.canStep(path[i - 1], path[i])).toBe(true);
  });

  it("meldet unerreichbare Ziele", () => {
    expect(findPath(grid(null), [0, 0], [1, 4])).toBeNull();
  });

  it("findet Stehplätze neben einem Objekt", () => {
    const g = grid(null, [[0, 0]]);
    expect(standSpots(g, [[0, 0]]).sort()).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it("putzt nicht durch die Wand", () => {
    // Objekt im Bad an der Wand zur Küche: Stehplätze nur im Bad
    const g = grid(null, [[4, 0]]);
    expect(standSpots(g, [[4, 0]]).sort()).toEqual([
      [4, 1],
      [5, 0],
    ]);
  });
});

describe("Avatar-Verhalten", () => {
  const objects = [
    { id: "sofa", type: "sofa", footprint: [[6, 2]] as [number, number][] },
  ];

  it("läuft herum, ohne Wände zu durchqueren", () => {
    const g = grid(null, [[6, 2]]);
    const rng = seededRng(42);
    let a = initialAvatar([0, 0]);
    for (let i = 0; i < 2000; i++) {
      const before: [number, number] = [Math.floor(a.x), Math.floor(a.y)];
      a = stepAvatar(a, 0.05, g, objects, rng).state;
      const after: [number, number] = [Math.floor(a.x), Math.floor(a.y)];
      expect(g.walkable.has(`${after[0]},${after[1]}`)).toBe(true);
      if (before[0] !== after[0] || before[1] !== after[1]) {
        expect(g.canStep(before, after)).toBe(true);
      }
    }
  });

  it("geht putzen und meldet danach die Erledigung", () => {
    const g = grid(null, [[6, 2]]);
    let a = sendToClean(initialAvatar([0, 0]), g, {
      id: "sofa",
      type: "sofa",
      footprint: [[6, 2]],
    });
    expect(a.mode).toBe("walk");
    const rng = seededRng(1);
    let cleaned = false;
    for (let i = 0; i < 400 && !cleaned; i++) {
      const r = stepAvatar(a, 0.05, g, objects, rng);
      a = r.state;
      if (r.event?.kind === "cleaned") cleaned = true;
    }
    expect(cleaned).toBe(true);
    expect(Math.hypot(a.x - 6.5, a.y - 2.5)).toBeLessThanOrEqual(1.01);
  });
});
