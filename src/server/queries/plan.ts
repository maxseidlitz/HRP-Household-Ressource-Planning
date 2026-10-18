import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db/client";
import { householdObject, objectGroup, room, user } from "@/db/schema";
import type { RoomType } from "@/catalog/rooms";
import {
  footprintTiles,
  normalizeTiles,
  parseDoors,
  parseTiles,
  validDoors,
  validatePlacement,
  validateRoomLayout,
  type Door,
  type Tile,
} from "@/domain/grid";
import { statusColor, worstStatus, type TaskStatus } from "@/domain/progress";
import { assert } from "../errors";
import { getMembership } from "./households";
import { canEditRoom, getObjectForEdit, getRoomForEdit } from "./rooms";
import { listTaskViews, type TaskView } from "./tasks";

export type ObjectStatus = {
  status: TaskStatus;
  color: string;
  progress: number;
  taskCount: number;
};

export type PlanRoom = {
  id: string;
  name: string;
  type: RoomType;
  tiles: Tile[];
  doors: Door[];
  parentRoomId: string | null;
  /** Fremdes privates Zimmer: nur Umriss und Namensschild. */
  foreign: boolean;
  ownerName: string | null;
  /** Darf den Grundriss ändern. */
  canEditOutline: boolean;
  /** Darf Möbel platzieren und Aufgaben pflegen. */
  canEditContent: boolean;
  floor: (ObjectStatus & { objectId: string }) | null;
};

export type PlanObject = {
  id: string;
  roomId: string;
  groupId: string | null;
  type: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  placed: boolean;
} & ObjectStatus;

export type PlanGroup = { id: string; roomId: string; name: string };

export type Plan = {
  rooms: PlanRoom[];
  objects: PlanObject[];
  groups: PlanGroup[];
  tasks: TaskView[];
};

function summarize(tasks: TaskView[]): ObjectStatus {
  const active = tasks.filter((t) => t.active);
  const maxProgress = active.reduce((m, t) => Math.max(m, t.progress), 0);
  return {
    status: worstStatus(tasks.map((t) => t.status)),
    color: active.length ? statusColor(maxProgress) : "#b8b0a2",
    progress: maxProgress,
    taskCount: tasks.length,
  };
}

/**
 * Daten für den Wohnungsplan (Spez. 4/12). Fremde private Zimmer liefern nur
 * Umriss und Namensschild, ihre Unterräume und Objekte gar nichts.
 */
export function getPlan(
  db: DB,
  input: { householdId: string; viewerId: string; now: Date },
): Plan {
  const member = getMembership(db, input.householdId, input.viewerId);
  assert(member, "Du bist kein Mitglied dieser WG.");
  const isAdmin = member.role === "admin";

  const rows = db
    .select({ room, ownerName: user.name })
    .from(room)
    .leftJoin(user, eq(user.id, room.privateOwnerId))
    .where(eq(room.householdId, input.householdId))
    .all()
    .filter(
      ({ room: r }) => !(r.parentRoomId && r.privateOwnerId !== input.viewerId),
    );

  const tasks = listTaskViews(db, input);
  const byObject = new Map<string, TaskView[]>();
  for (const t of tasks) {
    byObject.set(t.objectId, [...(byObject.get(t.objectId) ?? []), t]);
  }

  const visibleRoomIds = rows
    .filter(
      ({ room: r }) => !r.privateOwnerId || r.privateOwnerId === input.viewerId,
    )
    .map(({ room: r }) => r.id);
  const objects = visibleRoomIds.length
    ? db
        .select()
        .from(householdObject)
        .where(inArray(householdObject.roomId, visibleRoomIds))
        .all()
    : [];
  const groups = visibleRoomIds.length
    ? db
        .select()
        .from(objectGroup)
        .where(inArray(objectGroup.roomId, visibleRoomIds))
        .all()
    : [];

  const rooms: PlanRoom[] = rows.map(({ room: r, ownerName }) => {
    const foreign = Boolean(
      r.privateOwnerId && r.privateOwnerId !== input.viewerId,
    );
    const floorObj = foreign
      ? undefined
      : objects.find((o) => o.roomId === r.id && o.isFloor);
    const floorTasks = floorObj ? (byObject.get(floorObj.id) ?? []) : [];
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      tiles: parseTiles(r.tilesJson),
      doors: parseDoors(r.doorsJson),
      parentRoomId: r.parentRoomId,
      foreign,
      ownerName: ownerName ?? null,
      canEditOutline: r.parentRoomId
        ? r.privateOwnerId === input.viewerId
        : isAdmin || r.privateOwnerId === input.viewerId,
      canEditContent: canEditRoom(r, input.viewerId, isAdmin),
      floor:
        floorObj && floorTasks.length
          ? { objectId: floorObj.id, ...summarize(floorTasks) }
          : null,
    };
  });

  return {
    rooms,
    objects: objects
      .filter((o) => !o.isFloor)
      .map((o) => ({
        id: o.id,
        roomId: o.roomId,
        groupId: o.groupId,
        type: o.type,
        name: o.name,
        x: o.x,
        y: o.y,
        w: o.w,
        h: o.h,
        rotation: o.rotation,
        placed: o.placed,
        ...summarize(byObject.get(o.id) ?? []),
      })),
    groups: groups.map((g) => ({ id: g.id, roomId: g.roomId, name: g.name })),
    tasks,
  };
}

function householdRooms(db: DB, householdId: string) {
  return db.select().from(room).where(eq(room.householdId, householdId)).all();
}

/** Grundriss eines Raums speichern (Spez. 4.1/4.2). */
export function saveRoomLayout(
  db: DB,
  input: {
    householdId: string;
    actorId: string;
    roomId: string;
    tiles: Tile[];
    doors: Door[];
  },
) {
  const member = getMembership(db, input.householdId, input.actorId);
  assert(member, "Du bist kein Mitglied dieser WG.");
  const all = householdRooms(db, input.householdId);
  const r = all.find((x) => x.id === input.roomId);
  assert(r, "Raum nicht gefunden.");
  const isOwner = r.privateOwnerId === input.actorId;
  if (r.parentRoomId) {
    assert(
      isOwner,
      "Nur die Person, der das Zimmer gehört, kann es bearbeiten.",
    );
  } else if (r.privateOwnerId) {
    assert(
      isOwner || member.role === "admin",
      "Nur Admins oder die Person, der das Zimmer gehört, können den Umriss ändern.",
    );
  } else {
    assert(member.role === "admin", "Nur Admins dürfen den Grundriss ändern.");
  }

  const tiles = normalizeTiles(input.tiles);
  const children = all.filter((x) => x.parentRoomId === r.id);
  const blocked = all
    .filter(
      (x) =>
        x.id !== r.id && x.id !== r.parentRoomId && x.parentRoomId !== r.id,
    )
    .flatMap((x) => parseTiles(x.tilesJson));
  const parent = r.parentRoomId
    ? all.find((x) => x.id === r.parentRoomId)
    : undefined;
  const placed = db
    .select()
    .from(householdObject)
    .where(
      and(eq(householdObject.roomId, r.id), eq(householdObject.placed, true)),
    )
    .all();
  const error = validateRoomLayout({
    tiles,
    blocked,
    parentTiles: parent ? parseTiles(parent.tilesJson) : null,
    required: [
      ...children.flatMap((c) => parseTiles(c.tilesJson)),
      ...placed.flatMap((o) => footprintTiles(o)),
    ],
  });
  assert(!error, error ?? "");

  db.update(room)
    .set({
      tilesJson: JSON.stringify(tiles),
      doorsJson: JSON.stringify(validDoors(tiles, input.doors)),
    })
    .where(eq(room.id, r.id))
    .run();
}

/** Möbel auf dem Raster platzieren oder wieder in die Ablage legen. */
export function placeObject(
  db: DB,
  input: {
    householdId: string;
    viewerId: string;
    objectId: string;
    position: { x: number; y: number; rotation: number } | null;
  },
) {
  const o = getObjectForEdit(db, input);
  assert(!o.isFloor, "Der Boden gehört fest zum Raum.");
  if (!input.position) {
    db.update(householdObject)
      .set({ placed: false })
      .where(eq(householdObject.id, o.id))
      .run();
    return;
  }
  const { x, y, rotation } = input.position;
  assert([0, 90, 180, 270].includes(rotation), "Ungültige Drehung.");
  const r = getRoomForEdit(db, { ...input, roomId: o.roomId });
  const related = householdRooms(db, input.householdId).filter(
    (x) => x.id === r.id || x.id === r.parentRoomId || x.parentRoomId === r.id,
  );
  const occupied = db
    .select()
    .from(householdObject)
    .where(
      and(
        inArray(
          householdObject.roomId,
          related.map((x) => x.id),
        ),
        eq(householdObject.placed, true),
      ),
    )
    .all()
    .filter((other) => other.id !== o.id && !other.isFloor)
    .flatMap((other) => footprintTiles(other));
  const error = validatePlacement({
    footprint: footprintTiles({ ...o, x, y, rotation }),
    roomTiles: parseTiles(r.tilesJson),
    occupied,
  });
  assert(!error, error ?? "");
  db.update(householdObject)
    .set({ x, y, rotation, placed: true })
    .where(eq(householdObject.id, o.id))
    .run();
}

/** Objektgruppe, z. B. Einbauküche (Spez. 4.3). */
export function createGroup(
  db: DB,
  input: {
    householdId: string;
    viewerId: string;
    roomId: string;
    name: string;
    objectIds: string[];
  },
) {
  const r = getRoomForEdit(db, input);
  assert(
    input.objectIds.length >= 2,
    "Eine Gruppe braucht mindestens zwei Objekte.",
  );
  assert(input.name.trim().length > 0, "Die Gruppe braucht einen Namen.");
  const objs = db
    .select()
    .from(householdObject)
    .where(inArray(householdObject.id, input.objectIds))
    .all();
  assert(
    objs.length === input.objectIds.length &&
      objs.every((o) => o.roomId === r.id && !o.isFloor),
    "Alle Objekte einer Gruppe müssen im selben Raum stehen.",
  );
  return db.transaction((tx) => {
    const [g] = tx
      .insert(objectGroup)
      .values({ roomId: r.id, name: input.name.trim() })
      .returning()
      .all();
    tx.update(householdObject)
      .set({ groupId: g.id })
      .where(inArray(householdObject.id, input.objectIds))
      .run();
    return g;
  });
}

export function deleteGroup(
  db: DB,
  input: { householdId: string; viewerId: string; groupId: string },
) {
  const g = db
    .select()
    .from(objectGroup)
    .where(eq(objectGroup.id, input.groupId))
    .get();
  assert(g, "Gruppe nicht gefunden.");
  getRoomForEdit(db, { ...input, roomId: g.roomId });
  db.delete(objectGroup).where(eq(objectGroup.id, g.id)).run();
}
