import { describe, expect, it } from "vitest";
import {
  autoDoors,
  connected,
  doorTwin,
  reachableRooms,
  rectToTiles,
  sharedEdges,
  toggleDoorAt,
  translation,
  type BuildRoomShape,
} from "./build";

const room = (
  id: string,
  type: string,
  x: number,
  y: number,
  w: number,
  h: number,
  parentId: string | null = null,
): BuildRoomShape => ({
  id,
  type,
  tiles: rectToTiles({ x, y, w, h }),
  doors: [],
  parentId,
});

describe("Baumodus: Türen", () => {
  it("findet die gemeinsame Wand zweier Räume", () => {
    const a = room("a", "kitchen", 0, 0, 2, 2);
    const b = room("b", "hallway", 2, 0, 3, 2);
    expect(sharedEdges(a.tiles, b.tiles)).toEqual([
      { x: 1, y: 0, side: "e" },
      { x: 1, y: 1, side: "e" },
    ]);
    expect(doorTwin({ x: 1, y: 0, side: "e" })).toEqual({
      x: 2,
      y: 0,
      side: "w",
    });
  });

  it("verbindet jeden Raum, bevorzugt über den Flur, Tür auf beiden Seiten", () => {
    const rooms = [
      room("k", "kitchen", 0, 0, 4, 4),
      room("b", "bath", 4, 0, 3, 4),
      room("f", "hallway", 0, 4, 7, 2),
      room("l", "living", 0, 6, 4, 4),
      room("p", "balcony", 0, 10, 4, 2),
    ];
    const out = autoDoors(rooms);
    expect(reachableRooms(out).size).toBe(5);
    const byId = (id: string) => out.find((r) => r.id === id)!;
    // Küche und Bad grenzen aneinander, gehen aber zum Flur
    expect(connected(byId("k"), byId("f"))).toBe(true);
    expect(connected(byId("k"), byId("b"))).toBe(false);
    // Balkon über das Wohnzimmer
    expect(connected(byId("p"), byId("l"))).toBe(true);
    // Tür jeweils mittig und auf beiden Seiten gespeichert
    expect(byId("k").doors).toEqual([{ x: 2, y: 3, side: "s" }]);
    expect(byId("f").doors).toContainEqual({ x: 2, y: 4, side: "n" });
  });

  it("lässt bestehende Türen stehen und setzt keine doppelten", () => {
    const rooms = autoDoors([
      room("f", "hallway", 0, 0, 4, 2),
      room("k", "kitchen", 0, 2, 4, 3),
    ]);
    expect(autoDoors(rooms)).toEqual(rooms);
  });

  it("verbindet Unterräume mit ihrem Zimmer", () => {
    const out = autoDoors([
      room("f", "hallway", 0, 0, 6, 2),
      room("z", "bedroom", 0, 2, 6, 5),
      room("u", "bath", 0, 2, 2, 2, "z"),
    ]);
    const u = out.find((r) => r.id === "u")!;
    expect(u.doors).toHaveLength(1);
  });

  it("setzt und entfernt Türen per Antippen auf beiden Seiten", () => {
    const rooms = [
      room("a", "kitchen", 0, 0, 2, 2),
      room("b", "hallway", 2, 0, 2, 2),
    ];
    const on = toggleDoorAt(rooms, "a", { x: 1, y: 1, side: "e" });
    expect(on[0].doors).toEqual([{ x: 1, y: 1, side: "e" }]);
    expect(on[1].doors).toEqual([{ x: 2, y: 1, side: "w" }]);
    // Antippen von der anderen Seite entfernt sie wieder
    const off = toggleDoorAt(on, "b", { x: 2, y: 1, side: "w" });
    expect(off[0].doors).toEqual([]);
    expect(off[1].doors).toEqual([]);
    // Außenwand: Wohnungstür nur am eigenen Raum
    const front = toggleDoorAt(rooms, "a", { x: 0, y: 0, side: "w" });
    expect(front[0].doors).toEqual([{ x: 0, y: 0, side: "w" }]);
    expect(front[1].doors).toEqual([]);
  });
});

describe("Baumodus: Verschieben", () => {
  it("erkennt reine Verschiebungen", () => {
    const a = rectToTiles({ x: 1, y: 1, w: 3, h: 2 });
    expect(translation(a, rectToTiles({ x: 4, y: 0, w: 3, h: 2 }))).toEqual({
      dx: 3,
      dy: -1,
    });
    expect(translation(a, rectToTiles({ x: 1, y: 1, w: 2, h: 3 }))).toBeNull();
    expect(translation(a, a)).toEqual({ dx: 0, dy: 0 });
  });
});
