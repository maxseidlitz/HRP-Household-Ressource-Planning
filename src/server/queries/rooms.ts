import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { DB } from "@/db/client";
import { householdObject, room, task } from "@/db/schema";
import {
  FLOOR,
  objectDefinition,
  type TaskSuggestion,
} from "@/catalog/objects";
import type { RoomType } from "@/catalog/rooms";
import { initialBaseline, type LastDone } from "@/domain/progress";
import { assert } from "../errors";
import { getMembership } from "./households";

/** Transaktion oder Datenbank: beide haben dieselbe Query-API. */
type Tx = Pick<DB, "select" | "insert" | "update" | "delete">;

/**
 * Sichtbarkeit (Spez. 4.2): Gemeinschaftsräume für alle, private Zimmer nur
 * für ihre Besitzerin/ihren Besitzer. Gilt auch für Admins.
 */
export function visibleTo(viewerId: string) {
  return or(isNull(room.privateOwnerId), eq(room.privateOwnerId, viewerId));
}

export type RoomRow = typeof room.$inferSelect;

/** Gemeinschaftsräume bearbeiten Admins, private Zimmer nur ihre Besitzer. */
export function canEditRoom(
  r: Pick<RoomRow, "privateOwnerId">,
  viewerId: string,
  isAdmin: boolean,
): boolean {
  return r.privateOwnerId ? r.privateOwnerId === viewerId : isAdmin;
}

/** Alle Räume; für fremde private Zimmer nur Umriss-Infos. */
export function listRooms(db: DB, householdId: string) {
  return db
    .select()
    .from(room)
    .where(eq(room.householdId, householdId))
    .orderBy(asc(room.createdAt))
    .all();
}

export function getRoomForEdit(
  db: DB,
  input: { roomId: string; householdId: string; viewerId: string },
) {
  const r = db
    .select()
    .from(room)
    .where(
      and(eq(room.id, input.roomId), eq(room.householdId, input.householdId)),
    )
    .get();
  assert(r, "Raum nicht gefunden.");
  const m = getMembership(db, input.householdId, input.viewerId);
  assert(m, "Du bist kein Mitglied dieser WG.");
  assert(
    canEditRoom(r, input.viewerId, m.role === "admin"),
    r.privateOwnerId
      ? "Dieses Zimmer kann nur die Person einrichten, der es gehört."
      : "Nur Admins dürfen Gemeinschaftsräume bearbeiten.",
  );
  return r;
}

export function createRoom(
  db: DB,
  input: {
    householdId: string;
    actorId: string;
    type: RoomType;
    name: string;
    privateOwnerId?: string | null;
  },
) {
  const actor = getMembership(db, input.householdId, input.actorId);
  assert(actor?.role === "admin", "Nur Admins dürfen Räume anlegen.");
  if (input.privateOwnerId) {
    assert(
      getMembership(db, input.householdId, input.privateOwnerId),
      "Das Zimmer kann nur einem Mitglied zugewiesen werden.",
    );
  }
  return db.transaction((tx) => {
    const [r] = tx
      .insert(room)
      .values({
        householdId: input.householdId,
        type: input.type,
        name: input.name,
        privateOwnerId: input.privateOwnerId || null,
      })
      .returning()
      .all();
    insertFloor(tx, r);
    return r;
  });
}

function insertFloor(tx: Tx, r: RoomRow) {
  tx.insert(householdObject)
    .values({
      householdId: r.householdId,
      roomId: r.id,
      type: FLOOR.type,
      name: FLOOR.name,
      w: 0,
      h: 0,
      isFloor: true,
    })
    .run();
}

/** Entfernt alle Objekte und Aufgaben eines Raums, der Boden wird neu angelegt. */
export function clearRoomContents(tx: Tx, roomId: string) {
  const r = tx.select().from(room).where(eq(room.id, roomId)).get();
  if (!r) return;
  tx.delete(householdObject).where(eq(householdObject.roomId, roomId)).run();
  insertFloor(tx, r);
}

export function assignRoom(
  db: DB,
  input: {
    householdId: string;
    actorId: string;
    roomId: string;
    privateOwnerId: string | null;
  },
) {
  const actor = getMembership(db, input.householdId, input.actorId);
  assert(actor?.role === "admin", "Nur Admins dürfen Zimmer zuweisen.");
  const r = db
    .select()
    .from(room)
    .where(
      and(eq(room.id, input.roomId), eq(room.householdId, input.householdId)),
    )
    .get();
  assert(r, "Raum nicht gefunden.");
  if (input.privateOwnerId) {
    assert(
      getMembership(db, input.householdId, input.privateOwnerId),
      "Das Zimmer kann nur einem Mitglied zugewiesen werden.",
    );
  }
  db.transaction((tx) => {
    // Beim Wechsel der Besitzerin/des Besitzers wird der private Inhalt
    // gelöscht, damit niemand fremde private Daten übernimmt.
    if (r.privateOwnerId && r.privateOwnerId !== input.privateOwnerId) {
      tx.delete(room).where(eq(room.parentRoomId, r.id)).run();
      clearRoomContents(tx, r.id);
    }
    tx.update(room)
      .set({ privateOwnerId: input.privateOwnerId })
      .where(eq(room.id, r.id))
      .run();
  });
}

/**
 * Räume löschen: Admins löschen Räume im Gemeinschaftsplan, Unterräume
 * privater Zimmer löscht nur ihre Besitzerin/ihr Besitzer.
 */
export function deleteRoom(
  db: DB,
  input: { householdId: string; actorId: string; roomId: string },
) {
  const r = db
    .select()
    .from(room)
    .where(
      and(eq(room.id, input.roomId), eq(room.householdId, input.householdId)),
    )
    .get();
  assert(r, "Raum nicht gefunden.");
  const actor = getMembership(db, input.householdId, input.actorId);
  assert(actor, "Du bist kein Mitglied dieser WG.");
  if (r.parentRoomId) {
    assert(
      r.privateOwnerId === input.actorId,
      "Nur die Person, der das Zimmer gehört, kann Unterräume löschen.",
    );
  } else {
    assert(actor.role === "admin", "Nur Admins dürfen Räume löschen.");
  }
  db.delete(room).where(eq(room.id, r.id)).run();
}

/** Unterraum (z. B. eigenes Bad) im eigenen privaten Zimmer (Spez. 4.2). */
export function createSubroom(
  db: DB,
  input: {
    householdId: string;
    viewerId: string;
    parentRoomId: string;
    type: RoomType;
    name: string;
  },
) {
  const parent = getRoomForEdit(db, { ...input, roomId: input.parentRoomId });
  assert(
    parent.privateOwnerId === input.viewerId && !parent.parentRoomId,
    "Unterräume gibt es nur im eigenen privaten Zimmer.",
  );
  return db.transaction((tx) => {
    const [r] = tx
      .insert(room)
      .values({
        householdId: input.householdId,
        type: input.type,
        name: input.name,
        privateOwnerId: input.viewerId,
        parentRoomId: parent.id,
      })
      .returning()
      .all();
    insertFloor(tx, r);
    return r;
  });
}

export function listRoomContents(db: DB, roomId: string) {
  const objects = db
    .select()
    .from(householdObject)
    .where(eq(householdObject.roomId, roomId))
    .orderBy(asc(householdObject.isFloor), asc(householdObject.createdAt))
    .all();
  const tasks = db
    .select()
    .from(task)
    .innerJoin(householdObject, eq(householdObject.id, task.objectId))
    .where(eq(householdObject.roomId, roomId))
    .orderBy(asc(task.createdAt))
    .all()
    .map((r) => r.task);
  return objects
    .sort((a, b) => Number(b.isFloor) - Number(a.isFloor))
    .map((o) => ({ ...o, tasks: tasks.filter((t) => t.objectId === o.id) }));
}

export function addObject(
  db: DB,
  input: {
    householdId: string;
    viewerId: string;
    roomId: string;
    type: string;
    name?: string;
  },
) {
  const r = getRoomForEdit(db, input);
  const def = objectDefinition(input.type);
  assert(def && input.type !== FLOOR.type, "Unbekanntes Objekt.");
  const [o] = db
    .insert(householdObject)
    .values({
      householdId: input.householdId,
      roomId: r.id,
      type: def.type,
      name: input.name?.trim() || def.name,
      w: def.w,
      h: def.h,
    })
    .returning()
    .all();
  return o;
}

export function getObjectForEdit(
  db: DB,
  input: { householdId: string; viewerId: string; objectId: string },
) {
  const o = db
    .select()
    .from(householdObject)
    .where(
      and(
        eq(householdObject.id, input.objectId),
        eq(householdObject.householdId, input.householdId),
      ),
    )
    .get();
  assert(o, "Objekt nicht gefunden.");
  getRoomForEdit(db, { ...input, roomId: o.roomId });
  return o;
}

export function deleteObject(
  db: DB,
  input: { householdId: string; viewerId: string; objectId: string },
) {
  const o = getObjectForEdit(db, input);
  assert(!o.isFloor, "Der Boden gehört fest zum Raum.");
  db.delete(householdObject).where(eq(householdObject.id, o.id)).run();
}

export type NewTask = TaskSuggestion & { lastDone: LastDone };

export function addTasks(
  db: DB,
  input: {
    householdId: string;
    viewerId: string;
    objectId: string;
    tasks: NewTask[];
    now: Date;
  },
) {
  const o = getObjectForEdit(db, input);
  for (const t of input.tasks) validateTask(t);
  if (input.tasks.length === 0) return [];
  return db
    .insert(task)
    .values(
      input.tasks.map((t) => ({
        householdId: input.householdId,
        objectId: o.id,
        name: t.name.trim(),
        intervalDays: t.intervalDays,
        multiplier: t.multiplier,
        baselineAt: initialBaseline(t.lastDone, t.intervalDays, input.now),
      })),
    )
    .returning()
    .all();
}

function validateTask(t: TaskSuggestion) {
  assert(t.name.trim().length > 0, "Die Aufgabe braucht einen Namen.");
  assert(
    t.intervalDays >= 0.5 && t.intervalDays <= 365,
    "Das Intervall muss zwischen 0,5 und 365 Tagen liegen.",
  );
  assert(
    t.multiplier >= 0.5 && t.multiplier <= 5,
    "Der Multiplikator muss zwischen 0,5 und 5 liegen.",
  );
}

function getTaskForEdit(
  db: DB,
  input: { householdId: string; viewerId: string; taskId: string },
) {
  const t = db
    .select()
    .from(task)
    .where(
      and(eq(task.id, input.taskId), eq(task.householdId, input.householdId)),
    )
    .get();
  assert(t, "Aufgabe nicht gefunden.");
  getObjectForEdit(db, { ...input, objectId: t.objectId });
  return t;
}

export function updateTask(
  db: DB,
  input: {
    householdId: string;
    viewerId: string;
    taskId: string;
  } & TaskSuggestion,
) {
  const t = getTaskForEdit(db, input);
  validateTask(input);
  db.update(task)
    .set({
      name: input.name.trim(),
      intervalDays: input.intervalDays,
      multiplier: input.multiplier,
    })
    .where(eq(task.id, t.id))
    .run();
}

/** Pausieren/Reaktivieren; Reaktivierung startet die Zählung neu (Spez. 5.2). */
export function setTaskActive(
  db: DB,
  input: {
    householdId: string;
    viewerId: string;
    taskId: string;
    active: boolean;
    now: Date;
  },
) {
  const t = getTaskForEdit(db, input);
  if (t.active === input.active) return;
  db.update(task)
    .set(
      input.active
        ? { active: true, pausedAt: null, baselineAt: input.now }
        : { active: false, pausedAt: input.now },
    )
    .where(eq(task.id, t.id))
    .run();
}

export function deleteTask(
  db: DB,
  input: { householdId: string; viewerId: string; taskId: string },
) {
  const t = getTaskForEdit(db, input);
  db.delete(task).where(eq(task.id, t.id)).run();
}
