import { describe, expect, it } from "vitest";
import { householdObject, room, task } from "@/db/schema";
import { autoDoors, rectToTiles } from "@/domain/build";
import { addUser, testDb } from "@/test/db";
import { DomainError } from "../errors";
import { saveBuild, type BuildState } from "./build";
import { createHousehold } from "./households";
import { acceptInvite, createInvite } from "./invites";
import { getPlan } from "./plan";

const NOW = new Date("2026-11-12T10:00:00Z");

function setup() {
  const db = testDb();
  addUser(db, "max", "Max");
  addUser(db, "anna", "Anna");
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
  return { db, h };
}

type Rooms = BuildState["rooms"];
const r = (
  ref: string,
  type: Rooms[number]["type"],
  rect: { x: number; y: number; w: number; h: number },
  extra: Partial<Rooms[number]> = {},
): Rooms[number] => ({
  ref,
  type,
  name: ref,
  tiles: rectToTiles(rect),
  doors: [],
  ownerId: null,
  parentRef: null,
  ...extra,
});

/** Türen wie im Client automatisch setzen. */
function withDoors(rooms: Rooms): Rooms {
  const out = autoDoors(
    rooms.map((x) => ({
      id: x.ref,
      type: x.type,
      tiles: x.tiles,
      doors: x.doors,
      parentId: x.parentRef,
    })),
  );
  return rooms.map((x, i) => ({ ...x, doors: out[i].doors }));
}

/** Aktueller Stand aus Sicht einer Person, wie ihn der Baumodus lädt. */
function stateFor(
  db: ReturnType<typeof testDb>,
  householdId: string,
  viewerId: string,
): BuildState {
  const plan = getPlan(db, { householdId, viewerId, now: NOW });
  return {
    rooms: plan.rooms.map((x) => ({
      ref: x.id,
      type: x.type,
      name: x.name,
      tiles: x.tiles,
      doors: x.doors,
      ownerId: x.privateOwnerId,
      parentRef: x.parentRoomId,
    })),
    objects: plan.objects.map((o) => ({
      ref: o.id,
      roomRef: o.roomId,
      type: o.type,
      x: o.x,
      y: o.y,
      rotation: o.rotation as 0,
      placed: o.placed,
      groupRef: o.groupId,
    })),
    groups: plan.groups.map((g) => ({
      ref: g.id,
      roomRef: g.roomId,
      name: g.name,
    })),
  };
}

const save = (
  db: ReturnType<typeof testDb>,
  householdId: string,
  actorId: string,
  state: BuildState,
) => saveBuild(db, { householdId, actorId, now: NOW, state });

describe("Baumodus speichern", () => {
  it("legt Räume, Türen, Möbel und Aufgaben in einem Zug an", () => {
    const { db, h } = setup();
    const rooms = withDoors([
      r("new:f", "hallway", { x: 0, y: 4, w: 8, h: 2 }),
      r("new:k", "kitchen", { x: 0, y: 0, w: 8, h: 4 }),
      r(
        "new:z",
        "bedroom",
        { x: 0, y: 6, w: 4, h: 4 },
        { ownerId: "anna", name: "Annas Zimmer" },
      ),
    ]);
    const { ids } = save(db, h.id, "max", {
      rooms,
      objects: [
        {
          ref: "new:o1",
          roomRef: "new:k",
          type: "counter",
          x: 0,
          y: 0,
          rotation: 0,
          placed: true,
          groupRef: "new:g",
        },
        {
          ref: "new:o2",
          roomRef: "new:k",
          type: "stove",
          x: 3,
          y: 0,
          rotation: 0,
          placed: true,
          groupRef: "new:g",
        },
        {
          ref: "new:o3",
          roomRef: "new:k",
          type: "trash_rest",
          x: 7,
          y: 3,
          rotation: 0,
          placed: true,
          groupRef: null,
        },
      ],
      groups: [{ ref: "new:g", roomRef: "new:k", name: "Küchenzeile" }],
    });
    const plan = getPlan(db, { householdId: h.id, viewerId: "max", now: NOW });
    expect(plan.rooms.map((x) => x.name).sort()).toEqual([
      "Annas Zimmer",
      "new:f",
      "new:k",
    ]);
    // Türen zum Flur auf beiden Seiten
    const flur = plan.rooms.find((x) => x.id === ids["new:f"])!;
    expect(flur.doors).toHaveLength(2);
    expect(plan.groups).toEqual([
      { id: ids["new:g"], roomId: ids["new:k"], name: "Küchenzeile" },
    ]);
    expect(plan.objects.filter((o) => o.groupId === ids["new:g"])).toHaveLength(
      2,
    );
    // Aufgaben automatisch: Herd, Arbeitsplatte, Restmüll + Boden in Flur und Küche
    const names = plan.tasks.map((t) => t.name).sort();
    expect(names).toContain("Herd reinigen");
    expect(names).toContain("Restmüll rausbringen");
    expect(names.filter((n) => n === "Saugen")).toHaveLength(2);
    // Start bei 50 % („weiß nicht“)
    expect(plan.tasks.every((t) => Math.abs(t.progress - 0.5) < 0.01)).toBe(
      true,
    );
  });

  it("lehnt Überschneidungen ab und ändert dann gar nichts", () => {
    const { db, h } = setup();
    expect(() =>
      save(db, h.id, "max", {
        rooms: [
          r("new:a", "kitchen", { x: 0, y: 0, w: 4, h: 4 }),
          r("new:b", "bath", { x: 3, y: 0, w: 3, h: 3 }),
        ],
        objects: [],
        groups: [],
      }),
    ).toThrow(/überschneidet sich/);
    expect(db.select().from(room).all()).toHaveLength(0);
    expect(() =>
      save(db, h.id, "max", {
        rooms: [r("new:a", "kitchen", { x: 0, y: 0, w: 3, h: 3 })],
        objects: [
          {
            ref: "new:o",
            roomRef: "new:a",
            type: "sofa",
            x: 1,
            y: 1,
            rotation: 0,
            placed: true,
            groupRef: null,
          },
        ],
        groups: [],
      }),
    ).toThrow(/ganz in/);
  });

  it("nur Admins bauen Räume; Besitzer richten nur ihr Zimmer ein", () => {
    const { db, h } = setup();
    const { ids } = save(db, h.id, "max", {
      rooms: withDoors([
        r("new:f", "hallway", { x: 0, y: 0, w: 6, h: 2 }),
        r("new:z", "bedroom", { x: 0, y: 2, w: 6, h: 5 }, { ownerId: "anna" }),
      ]),
      objects: [],
      groups: [],
    });
    // Anna darf keinen Gemeinschaftsraum anlegen …
    const anna = stateFor(db, h.id, "anna");
    expect(() =>
      save(db, h.id, "anna", {
        ...anna,
        rooms: [
          ...anna.rooms,
          r("new:x", "storage", { x: 8, y: 0, w: 2, h: 2 }),
        ],
      }),
    ).toThrow(DomainError);
    // … Umrissänderungen am Flur werden ignoriert …
    const flur = anna.rooms.find((x) => x.ref === ids["new:f"])!;
    save(db, h.id, "anna", {
      ...anna,
      rooms: anna.rooms.map((x) =>
        x === flur
          ? {
              ...x,
              name: "Gang",
              tiles: rectToTiles({ x: 0, y: 0, w: 2, h: 2 }),
            }
          : x,
      ),
    });
    expect(
      getPlan(db, { householdId: h.id, viewerId: "max", now: NOW }).rooms.find(
        (x) => x.id === ids["new:f"],
      )!.name,
    ).toBe("new:f");
    // … aber ihr Zimmer einrichten und ein eigenes Bad darin anlegen
    const a2 = stateFor(db, h.id, "anna");
    save(db, h.id, "anna", {
      rooms: [
        ...a2.rooms,
        r(
          "new:bad",
          "bath",
          { x: 4, y: 5, w: 2, h: 2 },
          { parentRef: ids["new:z"] },
        ),
      ],
      objects: [
        {
          ref: "new:p",
          roomRef: ids["new:z"],
          type: "plant",
          x: 0,
          y: 2,
          rotation: 0,
          placed: true,
          groupRef: null,
        },
      ],
      groups: [],
    });
    const annaPlan = getPlan(db, {
      householdId: h.id,
      viewerId: "anna",
      now: NOW,
    });
    expect(annaPlan.objects.map((o) => o.type)).toEqual(["plant"]);
    expect(annaPlan.rooms.some((x) => x.parentRoomId === ids["new:z"])).toBe(
      true,
    );
    // Der Admin sieht weiter nur den Umriss
    const maxPlan = getPlan(db, {
      householdId: h.id,
      viewerId: "max",
      now: NOW,
    });
    expect(maxPlan.objects).toHaveLength(0);
    expect(maxPlan.rooms.find((x) => x.id === ids["new:z"])!.foreign).toBe(
      true,
    );
  });

  it("Admin verschiebt ein privates Zimmer, der unsichtbare Inhalt wandert mit", () => {
    const { db, h } = setup();
    const { ids } = save(db, h.id, "max", {
      rooms: [
        r("new:z", "bedroom", { x: 0, y: 0, w: 4, h: 4 }, { ownerId: "anna" }),
      ],
      objects: [],
      groups: [],
    });
    const z = ids["new:z"];
    const anna = stateFor(db, h.id, "anna");
    save(db, h.id, "anna", {
      rooms: [
        ...anna.rooms,
        r("new:u", "bath", { x: 2, y: 2, w: 2, h: 2 }, { parentRef: z }),
      ],
      objects: [
        {
          ref: "new:p",
          roomRef: z,
          type: "plant",
          x: 0,
          y: 0,
          rotation: 0,
          placed: true,
          groupRef: null,
        },
      ],
      groups: [],
    });
    // Max sieht weder Pflanze noch Unterraum und schickt nur den Umriss
    const max = stateFor(db, h.id, "max");
    expect(max.objects).toHaveLength(0);
    save(db, h.id, "max", {
      ...max,
      rooms: max.rooms.map((x) => ({
        ...x,
        tiles: rectToTiles({ x: 5, y: 3, w: 4, h: 4 }),
      })),
    });
    const after = getPlan(db, {
      householdId: h.id,
      viewerId: "anna",
      now: NOW,
    });
    expect(after.objects[0]).toMatchObject({ x: 5, y: 3 });
    expect(after.rooms.find((x) => x.parentRoomId === z)!.tiles).toContainEqual(
      [7, 5],
    );
    // Verkleinern, sodass die Pflanze draußen stünde: abgelehnt, ohne Details
    const max2 = stateFor(db, h.id, "max");
    expect(() =>
      save(db, h.id, "max", {
        ...max2,
        rooms: max2.rooms.map((x) => ({
          ...x,
          tiles: rectToTiles({ x: 6, y: 3, w: 3, h: 4 }),
        })),
      }),
    ).toThrow(/steht dort noch etwas/);
  });

  it("Besitzerwechsel leert das Zimmer, entfernte Möbel samt Aufgaben weg", () => {
    const { db, h } = setup();
    const { ids } = save(db, h.id, "max", {
      rooms: [
        r("new:k", "kitchen", { x: 0, y: 0, w: 4, h: 4 }),
        r("new:z", "bedroom", { x: 4, y: 0, w: 4, h: 4 }, { ownerId: "anna" }),
      ],
      objects: [
        {
          ref: "new:o",
          roomRef: "new:k",
          type: "stove",
          x: 0,
          y: 0,
          rotation: 0,
          placed: true,
          groupRef: null,
        },
      ],
      groups: [],
    });
    const anna = stateFor(db, h.id, "anna");
    save(db, h.id, "anna", {
      ...anna,
      objects: [
        ...anna.objects,
        {
          ref: "new:p",
          roomRef: ids["new:z"],
          type: "plant",
          x: 4,
          y: 0,
          rotation: 0,
          placed: true,
          groupRef: null,
        },
      ],
    });
    const max = stateFor(db, h.id, "max");
    save(db, h.id, "max", {
      ...max,
      objects: [],
      rooms: max.rooms.map((x) =>
        x.ref === ids["new:z"] ? { ...x, ownerId: "max" } : x,
      ),
    });
    const objs = db
      .select()
      .from(householdObject)
      .all()
      .filter((o) => !o.isFloor);
    expect(objs).toHaveLength(0);
    expect(
      db
        .select()
        .from(task)
        .all()
        .map((t) => t.name),
    ).not.toContain("Herd reinigen");
  });
});
