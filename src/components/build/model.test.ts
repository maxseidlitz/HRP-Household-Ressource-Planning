import { describe, expect, it } from "vitest";
import {
  addRoom,
  applyIds,
  applyTemplate,
  catalogCards,
  cardPlacementOk,
  deleteRoom,
  findSpot,
  moveRoom,
  placeCard,
  placementOk,
  roomLayoutOk,
  TEMPLATES,
  unreachable,
  type Model,
  type Viewer,
} from "./model";

const admin: Viewer = { id: "max", isAdmin: true };
const empty: Model = { rooms: [], objects: [], groups: [] };
const card = (type: string) => catalogCards().find((c) => c.def.type === type)!;

describe("Baumodus-Modell", () => {
  it.each(TEMPLATES.map((t) => [t.name, t] as const))(
    "Vorlage %s ist gültig und komplett verbunden",
    (_, t) => {
      const m = applyTemplate(t);
      expect(m.rooms).toHaveLength(t.rooms.length);
      expect(unreachable(m)).toEqual([]);
      for (const r of m.rooms) expect(roomLayoutOk(m, r, r.tiles)).toBeNull();
      for (const o of m.objects) {
        const res = placementOk(m, admin, o);
        expect(res.ok, `${o.type} in ${t.name}`).toBe(true);
      }
    },
  );

  it("Küchenzeile: drei Teile, eine Gruppe, jedes Teil einzeln", () => {
    const { model, ref } = addRoom(empty, {
      type: "kitchen",
      rect: { x: 0, y: 0, w: 8, h: 4 },
    });
    const k = card("kitchenette");
    expect(cardPlacementOk(model, admin, k, 0, 0, 0).ok).toBe(true);
    // zu breit für die Lücke ab x=2
    expect(cardPlacementOk(model, admin, k, 2, 0, 0).ok).toBe(false);
    const placed = placeCard(model, k, ref, 0, 0, 0);
    expect(placed.model.objects.map((o) => [o.type, o.x])).toEqual([
      ["counter", 0],
      ["stove", 3],
      ["sink", 5],
    ]);
    expect(placed.model.groups).toEqual([
      {
        ref: placed.model.objects[0].groupRef,
        roomRef: ref,
        name: "Küchenzeile",
      },
    ]);
    // Hochkant passt sie nicht in einen 4 Kacheln hohen Raum
    expect(cardPlacementOk(model, admin, k, 0, 0, 90).ok).toBe(false);
  });

  it("findet automatisch einen freien Platz, im Zweifel gedreht", () => {
    const { model, ref } = addRoom(empty, {
      type: "living",
      rect: { x: 0, y: 0, w: 2, h: 5 },
    });
    const room = model.rooms.find((r) => r.ref === ref)!;
    // Sofa 4×2 passt nur hochkant
    expect(findSpot(model, admin, card("sofa"), room)).toEqual({
      x: 0,
      y: 0,
      rotation: 90,
    });
  });

  it("Raum verschieben nimmt Möbel mit und verbindet neu", () => {
    let m = addRoom(empty, {
      type: "hallway",
      rect: { x: 0, y: 0, w: 6, h: 2 },
    }).model;
    const k = addRoom(m, { type: "kitchen", rect: { x: 0, y: 2, w: 4, h: 3 } });
    m = placeCard(k.model, card("plant"), k.ref, 1, 3, 0).model;
    const moved = moveRoom(m, k.ref, 2, 0);
    expect(moved.objects[0]).toMatchObject({ x: 3, y: 3 });
    expect(unreachable(moved)).toEqual([]);
    // Wegschieben ohne Kontakt → nicht mehr erreichbar
    const away = moveRoom(m, k.ref, 0, 4);
    expect(unreachable(away).map((r) => r.type)).toEqual(["kitchen"]);
    expect(deleteRoom(away, k.ref).objects).toEqual([]);
  });

  it("ersetzt vorläufige Referenzen nach dem Speichern", () => {
    const { model, ref } = addRoom(empty, {
      type: "bath",
      rect: { x: 0, y: 0, w: 3, h: 3 },
    });
    const placed = placeCard(model, card("toilet"), ref, 0, 0, 0).model;
    const mapped = applyIds(placed, { [ref]: "room-1" });
    expect(mapped.rooms[0].ref).toBe("room-1");
    expect(mapped.objects[0].roomRef).toBe("room-1");
  });
});
