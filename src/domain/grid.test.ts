import { describe, expect, it } from "vitest";
import {
  addTiles,
  edgeAt,
  footprintTiles,
  isConnected,
  labelTile,
  nextRotation,
  parseTiles,
  rectTiles,
  removeTiles,
  toggleDoor,
  validDoors,
  validatePlacement,
  validateRoomLayout,
  wallEdges,
} from "./grid";

describe("Kacheln", () => {
  it("zieht Rechtecke in beliebiger Richtung auf", () => {
    expect(rectTiles([2, 1], [1, 0])).toEqual([
      [1, 0],
      [2, 0],
      [1, 1],
      [2, 1],
    ]);
  });

  it("fügt L-Formen zusammen und entfernt Duplikate", () => {
    const l = addTiles(rectTiles([0, 0], [2, 0]), rectTiles([0, 0], [0, 2]));
    expect(l).toHaveLength(5);
    expect(isConnected(l)).toBe(true);
  });

  it("erkennt Inseln", () => {
    expect(
      isConnected([
        [0, 0],
        [2, 0],
      ]),
    ).toBe(false);
    expect(isConnected(removeTiles(rectTiles([0, 0], [2, 0]), [[1, 0]]))).toBe(
      false,
    );
  });

  it("verwirft ungültiges JSON", () => {
    expect(parseTiles("kaputt")).toEqual([]);
    expect(parseTiles("[[1,2],[99,0]]")).toEqual([]);
    expect(parseTiles("[[1,2]]")).toEqual([[1, 2]]);
  });
});

describe("Wände & Türen", () => {
  const room = rectTiles([0, 0], [1, 1]);

  it("findet die Außenkanten eines Raums", () => {
    expect(wallEdges(room)).toHaveLength(8);
    expect(wallEdges([[0, 0]])).toHaveLength(4);
  });

  it("lässt Türen nur auf Wänden zu", () => {
    const doors = [
      { x: 0, y: 0, side: "n" as const },
      { x: 0, y: 0, side: "e" as const }, // Innenkante
      { x: 0, y: 0, side: "n" as const }, // Duplikat
    ];
    expect(validDoors(room, doors)).toEqual([{ x: 0, y: 0, side: "n" }]);
  });

  it("schaltet Türen um", () => {
    const d = { x: 1, y: 1, side: "s" as const };
    expect(toggleDoor(toggleDoor([], d), d)).toEqual([]);
  });

  it("ordnet Klickpunkte der nächsten Kante zu", () => {
    expect(edgeAt(3.5, 4.05)).toEqual({ x: 3, y: 4, side: "n" });
    expect(edgeAt(3.97, 4.5)).toEqual({ x: 3, y: 4, side: "e" });
  });
});

describe("Möbel", () => {
  it("dreht die Grundfläche", () => {
    const sofa = { x: 1, y: 1, w: 3, h: 1, rotation: 0 };
    expect(footprintTiles(sofa)).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
    expect(footprintTiles({ ...sofa, rotation: 90 })).toEqual([
      [1, 1],
      [1, 2],
      [1, 3],
    ]);
    expect(nextRotation(270)).toBe(0);
  });

  it("prüft Raumgrenzen und Überschneidungen", () => {
    const roomTiles = rectTiles([0, 0], [3, 3]);
    expect(
      validatePlacement({
        footprint: rectTiles([3, 3], [4, 3]),
        roomTiles,
        occupied: [],
      }),
    ).toMatch(/ganz im Raum/);
    expect(
      validatePlacement({ footprint: [[1, 1]], roomTiles, occupied: [[1, 1]] }),
    ).toMatch(/schon etwas/);
    expect(
      validatePlacement({ footprint: [[1, 1]], roomTiles, occupied: [] }),
    ).toBeNull();
  });
});

describe("validateRoomLayout", () => {
  const tiles = rectTiles([0, 0], [3, 3]);

  it("akzeptiert einen freien, zusammenhängenden Raum", () => {
    expect(
      validateRoomLayout({
        tiles,
        blocked: rectTiles([4, 0], [6, 3]),
        required: [],
      }),
    ).toBeNull();
  });

  it("verhindert Überschneidungen mit anderen Räumen", () => {
    expect(
      validateRoomLayout({ tiles, blocked: [[3, 3]], required: [] }),
    ).toMatch(/überschneidet/);
  });

  it("hält Unterräume im Zimmer", () => {
    expect(
      validateRoomLayout({
        tiles: [
          [0, 0],
          [1, 0],
        ],
        parentTiles: [[0, 0]],
        blocked: [],
        required: [],
      }),
    ).toMatch(/innerhalb des Zimmers/);
  });

  it("verbietet das Wegnehmen belegter Kacheln", () => {
    expect(
      validateRoomLayout({
        tiles: rectTiles([0, 0], [1, 1]),
        blocked: [],
        required: [[3, 3]],
      }),
    ).toMatch(/Möbel/);
  });

  it("verbietet Inseln", () => {
    expect(
      validateRoomLayout({
        tiles: [
          [0, 0],
          [5, 5],
        ],
        blocked: [],
        required: [],
      }),
    ).toMatch(/zusammenhängen/);
  });

  it("findet eine Kachel fürs Namensschild", () => {
    expect(labelTile(tiles)).toEqual([1, 1]);
    expect(labelTile([])).toBeNull();
  });
});
