import { describe, expect, it } from "vitest";
import { rectTiles } from "@/domain/grid";
import { addUser, testDb } from "@/test/db";
import { DomainError } from "../errors";
import { createHousehold } from "./households";
import { acceptInvite, createInvite } from "./invites";
import { createGroup, getPlan, placeObject, saveRoomLayout } from "./plan";
import {
  addObject,
  addTasks,
  createRoom,
  createSubroom,
  deleteRoom,
} from "./rooms";

const NOW = new Date("2026-10-18T10:00:00Z");

function setup() {
  const db = testDb();
  addUser(db, "max");
  addUser(db, "anna");
  const h = createHousehold(db, {
    userId: "max",
    name: "WG",
    expectedMemberCount: 2,
  });
  const i = createInvite(db, {
    householdId: h.id,
    actorId: "max",
    validDays: 7,
    singleUse: true,
    now: NOW,
  });
  acceptInvite(db, { token: i.token, userId: "anna", now: NOW });
  const kitchen = createRoom(db, {
    householdId: h.id,
    actorId: "max",
    type: "kitchen",
    name: "Küche",
  });
  const annas = createRoom(db, {
    householdId: h.id,
    actorId: "max",
    type: "bedroom",
    name: "Annas Zimmer",
    privateOwnerId: "anna",
  });
  saveRoomLayout(db, {
    householdId: h.id,
    actorId: "max",
    roomId: kitchen.id,
    tiles: rectTiles([0, 0], [5, 3]),
    doors: [],
  });
  saveRoomLayout(db, {
    householdId: h.id,
    actorId: "max",
    roomId: annas.id,
    tiles: rectTiles([6, 0], [9, 3]),
    doors: [],
  });
  return { db, h, kitchen, annas };
}

const throws = (fn: () => unknown, msg: RegExp) => {
  expect(fn).toThrow(DomainError);
  expect(fn).toThrow(msg);
};

describe("Grundriss", () => {
  it("speichert Kacheln und nur gültige Türen", () => {
    const { db, h, kitchen } = setup();
    saveRoomLayout(db, {
      householdId: h.id,
      actorId: "max",
      roomId: kitchen.id,
      tiles: rectTiles([0, 0], [5, 3]),
      doors: [
        { x: 0, y: 0, side: "n" },
        { x: 1, y: 1, side: "n" }, // Innenkante → verworfen
      ],
    });
    const k = getPlan(db, {
      householdId: h.id,
      viewerId: "max",
      now: NOW,
    }).rooms.find((r) => r.id === kitchen.id)!;
    expect(k.tiles).toHaveLength(24);
    expect(k.doors).toEqual([{ x: 0, y: 0, side: "n" }]);
  });

  it("verhindert Überschneidungen zwischen Räumen", () => {
    const { db, h, kitchen } = setup();
    throws(
      () =>
        saveRoomLayout(db, {
          householdId: h.id,
          actorId: "max",
          roomId: kitchen.id,
          tiles: rectTiles([0, 0], [6, 3]),
          doors: [],
        }),
      /überschneidet/,
    );
  });

  it("lässt Mitglieder keinen Gemeinschaftsraum ändern", () => {
    const { db, h, kitchen } = setup();
    throws(
      () =>
        saveRoomLayout(db, {
          householdId: h.id,
          actorId: "anna",
          roomId: kitchen.id,
          tiles: [[0, 0]],
          doors: [],
        }),
      /Nur Admins/,
    );
  });

  it("lässt die Besitzerin ihr Zimmer auf freie Kacheln erweitern", () => {
    const { db, h, annas } = setup();
    saveRoomLayout(db, {
      householdId: h.id,
      actorId: "anna",
      roomId: annas.id,
      tiles: rectTiles([6, 0], [9, 6]),
      doors: [],
    });
    throws(
      () =>
        saveRoomLayout(db, {
          householdId: h.id,
          actorId: "anna",
          roomId: annas.id,
          tiles: rectTiles([5, 0], [9, 6]),
          doors: [],
        }),
      /überschneidet/,
    );
  });
});

describe("Plan-Sichtbarkeit (Spez. 4.2)", () => {
  it("zeigt fremde private Zimmer nur als Umriss", () => {
    const { db, h, annas } = setup();
    const plant = addObject(db, {
      householdId: h.id,
      viewerId: "anna",
      roomId: annas.id,
      type: "plant",
    });
    addTasks(db, {
      householdId: h.id,
      viewerId: "anna",
      objectId: plant.id,
      tasks: [
        { name: "Gießen", intervalDays: 4, multiplier: 1, lastDone: "unknown" },
      ],
      now: NOW,
    });
    const bad = createSubroom(db, {
      householdId: h.id,
      viewerId: "anna",
      parentRoomId: annas.id,
      type: "bath",
      name: "Eigenes Bad",
    });

    const maxPlan = getPlan(db, {
      householdId: h.id,
      viewerId: "max",
      now: NOW,
    });
    const outline = maxPlan.rooms.find((r) => r.id === annas.id)!;
    expect(outline).toMatchObject({
      foreign: true,
      ownerName: "anna",
      canEditContent: false,
      floor: null,
    });
    expect(outline.tiles).toHaveLength(16); // Umriss sichtbar
    expect(maxPlan.rooms.find((r) => r.id === bad.id)).toBeUndefined();
    expect(maxPlan.objects.find((o) => o.id === plant.id)).toBeUndefined();
    expect(maxPlan.tasks.map((t) => t.name)).not.toContain("Gießen");

    const annaPlan = getPlan(db, {
      householdId: h.id,
      viewerId: "anna",
      now: NOW,
    });
    expect(annaPlan.rooms.find((r) => r.id === bad.id)).toBeDefined();
    expect(annaPlan.objects.find((o) => o.id === plant.id)).toMatchObject({
      status: "sweet",
      taskCount: 1,
    });
  });

  it("hält Unterräume im Zimmer und lässt nur die Besitzerin sie löschen", () => {
    const { db, h, annas } = setup();
    const bad = createSubroom(db, {
      householdId: h.id,
      viewerId: "anna",
      parentRoomId: annas.id,
      type: "bath",
      name: "Bad",
    });
    saveRoomLayout(db, {
      householdId: h.id,
      actorId: "anna",
      roomId: bad.id,
      tiles: rectTiles([6, 0], [7, 1]),
      doors: [],
    });
    throws(
      () =>
        saveRoomLayout(db, {
          householdId: h.id,
          actorId: "anna",
          roomId: bad.id,
          tiles: rectTiles([6, 3], [7, 4]),
          doors: [],
        }),
      /innerhalb des Zimmers/,
    );
    // Das Zimmer darf nicht kleiner als sein Unterraum werden.
    throws(
      () =>
        saveRoomLayout(db, {
          householdId: h.id,
          actorId: "anna",
          roomId: annas.id,
          tiles: rectTiles([8, 0], [9, 3]),
          doors: [],
        }),
      /Unterraum/,
    );
    throws(
      () =>
        deleteRoom(db, { householdId: h.id, actorId: "max", roomId: bad.id }),
      /Nur die Person/,
    );
    throws(
      () =>
        createSubroom(db, {
          householdId: h.id,
          viewerId: "max",
          parentRoomId: annas.id,
          type: "bath",
          name: "X",
        }),
      /nur die Person/,
    );
    deleteRoom(db, { householdId: h.id, actorId: "anna", roomId: bad.id });
  });
});

describe("Möbel platzieren", () => {
  it("platziert, dreht und verhindert Überschneidungen", () => {
    const { db, h, kitchen } = setup();
    const sofa = addObject(db, {
      householdId: h.id,
      viewerId: "max",
      roomId: kitchen.id,
      type: "counter",
    }); // 3×2
    const fridge = addObject(db, {
      householdId: h.id,
      viewerId: "max",
      roomId: kitchen.id,
      type: "fridge",
    }); // 2×2
    const base = { householdId: h.id, viewerId: "max" };

    placeObject(db, {
      ...base,
      objectId: sofa.id,
      position: { x: 0, y: 0, rotation: 0 },
    });
    throws(
      () =>
        placeObject(db, {
          ...base,
          objectId: fridge.id,
          position: { x: 2, y: 1, rotation: 0 },
        }),
      /schon etwas/,
    );
    throws(
      () =>
        placeObject(db, {
          ...base,
          objectId: fridge.id,
          position: { x: 5, y: 0, rotation: 0 },
        }),
      /ganz im Raum/,
    );
    placeObject(db, {
      ...base,
      objectId: fridge.id,
      position: { x: 4, y: 0, rotation: 0 },
    });
    // Gedreht ist die Arbeitsplatte 2×3 und passt dann nicht mehr neben den Kühlschrank.
    throws(
      () =>
        placeObject(db, {
          ...base,
          objectId: sofa.id,
          position: { x: 3, y: 0, rotation: 90 },
        }),
      /schon etwas/,
    );

    const plan = getPlan(db, { householdId: h.id, viewerId: "max", now: NOW });
    expect(plan.objects.filter((o) => o.placed)).toHaveLength(2);

    // Möbel blockieren das Verkleinern des Raums
    throws(
      () =>
        saveRoomLayout(db, {
          ...base,
          actorId: "max",
          roomId: kitchen.id,
          tiles: rectTiles([0, 0], [3, 3]),
          doors: [],
        }),
      /Möbel/,
    );
    placeObject(db, { ...base, objectId: fridge.id, position: null });
    saveRoomLayout(db, {
      ...base,
      actorId: "max",
      roomId: kitchen.id,
      tiles: rectTiles([0, 0], [3, 3]),
      doors: [],
    });
  });

  it("gruppiert Objekte eines Raums zur Einbauküche", () => {
    const { db, h, kitchen, annas } = setup();
    const base = { householdId: h.id, viewerId: "max" };
    const a = addObject(db, { ...base, roomId: kitchen.id, type: "stove" });
    const b = addObject(db, { ...base, roomId: kitchen.id, type: "sink" });
    const g = createGroup(db, {
      ...base,
      roomId: kitchen.id,
      name: "Einbauküche",
      objectIds: [a.id, b.id],
    });
    const plan = getPlan(db, { householdId: h.id, viewerId: "max", now: NOW });
    expect(plan.groups).toEqual([
      { id: g.id, roomId: kitchen.id, name: "Einbauküche" },
    ]);
    expect(plan.objects.filter((o) => o.groupId === g.id)).toHaveLength(2);
    throws(
      () =>
        createGroup(db, {
          ...base,
          roomId: kitchen.id,
          name: "X",
          objectIds: [a.id],
        }),
      /mindestens zwei/,
    );
    const plant = addObject(db, {
      householdId: h.id,
      viewerId: "anna",
      roomId: annas.id,
      type: "plant",
    });
    throws(
      () =>
        createGroup(db, {
          ...base,
          roomId: kitchen.id,
          name: "X",
          objectIds: [a.id, plant.id],
        }),
      /selben Raum/,
    );
  });
});
