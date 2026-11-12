import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db/client";
import {
  completion,
  householdObject,
  objectGroup,
  room,
  ROOM_TYPES,
  task,
} from "@/db/schema";
import {
  floorSuggestions,
  FLOOR,
  objectDefinition,
  type TaskSuggestion,
} from "@/catalog/objects";
import type { RoomType } from "@/catalog/rooms";
import { shiftDoors, shiftTiles, translation } from "@/domain/build";
import {
  doorSchema,
  footprintTiles,
  isConnected,
  normalizeTiles,
  parseDoors,
  parseTiles,
  tileKey,
  tileSchema,
  tileSet,
  validDoors,
  type Tile,
} from "@/domain/grid";
import { initialBaseline, type LastDone } from "@/domain/progress";
import { assert } from "../errors";
import { getMembership } from "./members";
import { getObjectForEdit } from "./rooms";

/**
 * Baumodus (Wohnung bauen): Der Client schickt den ganzen bearbeiteten
 * Stand, der Server gleicht ihn mit der Datenbank ab. Wer was ändern darf:
 *
 * - Admins: Umrisse, Namen, Typen, Türen und Besitzer aller Zimmer sowie
 *   Möbel in Gemeinschaftsräumen.
 * - Besitzer:in eines privaten Zimmers: Möbel und Unterräume darin.
 *
 * Inhalte fremder privater Zimmer sieht und schickt der Client nie. Wird ein
 * solches Zimmer nur verschoben, wandert sein unsichtbarer Inhalt mit.
 */
const ref = z.string().min(1).max(80);
export const buildStateSchema = z.object({
  rooms: z
    .array(
      z.object({
        ref,
        type: z.enum(ROOM_TYPES),
        name: z.string().trim().min(1).max(60),
        tiles: z
          .array(tileSchema)
          .max(1600)
          .transform((t) => t as Tile[]),
        doors: z.array(doorSchema).max(200),
        ownerId: z.string().nullable(),
        parentRef: ref.nullable(),
      }),
    )
    .max(60),
  objects: z
    .array(
      z.object({
        ref,
        roomRef: ref,
        type: z.string().max(40),
        x: z.number().int(),
        y: z.number().int(),
        rotation: z.union([
          z.literal(0),
          z.literal(90),
          z.literal(180),
          z.literal(270),
        ]),
        placed: z.boolean(),
        groupRef: ref.nullable(),
      }),
    )
    .max(400),
  groups: z
    .array(
      z.object({ ref, roomRef: ref, name: z.string().trim().min(1).max(60) }),
    )
    .max(60),
});
export type BuildState = z.infer<typeof buildStateSchema>;

type RoomRow = typeof room.$inferSelect;

function insertTasks(
  tx: DB,
  input: {
    householdId: string;
    objectId: string;
    suggestions: TaskSuggestion[];
    now: Date;
  },
) {
  if (!input.suggestions.length) return;
  tx.insert(task)
    .values(
      input.suggestions.map((t) => ({
        householdId: input.householdId,
        objectId: input.objectId,
        name: t.name,
        intervalDays: t.intervalDays,
        multiplier: t.multiplier,
        // „Zuletzt gemacht: weiß nicht“ → Start bei 50 %
        baselineAt: initialBaseline("unknown", t.intervalDays, input.now),
      })),
    )
    .run();
}

export function saveBuild(
  db: DB,
  input: {
    householdId: string;
    actorId: string;
    now: Date;
    state: BuildState;
  },
): { ids: Record<string, string> } {
  const member = getMembership(db, input.householdId, input.actorId);
  assert(member, "Du bist kein Mitglied dieser WG.");
  const isAdmin = member.role === "admin";
  const actor = input.actorId;
  const { state } = input;

  const canOutline = (r: Pick<RoomRow, "parentRoomId" | "privateOwnerId">) =>
    r.parentRoomId ? r.privateOwnerId === actor : isAdmin;
  const canContent = (r: Pick<RoomRow, "privateOwnerId">) =>
    r.privateOwnerId ? r.privateOwnerId === actor : isAdmin;

  return db.transaction((tx) => {
    const t = tx as DB;
    const ids = new Map<string, string>();
    const dbRooms = new Map(
      t
        .select()
        .from(room)
        .where(eq(room.householdId, input.householdId))
        .all()
        .map((r) => [r.id, r]),
    );
    const sent = new Map(state.rooms.map((r) => [r.ref, r]));
    for (const r of state.rooms) if (dbRooms.has(r.ref)) ids.set(r.ref, r.ref);
    const objectsInPayload = new Set(state.objects.map((o) => o.ref));
    const roomsInPayload = new Set(state.rooms.map((r) => r.ref));

    // --- Räume löschen, die der Client weggenommen hat ---
    for (const r of dbRooms.values()) {
      if (sent.has(r.id) || !canOutline(r)) continue;
      // Unterräume eines gelöschten Zimmers mit entfernen
      const doomed = [
        r.id,
        ...[...dbRooms.values()]
          .filter((c) => c.parentRoomId === r.id)
          .map((c) => c.id),
      ];
      t.delete(room).where(inArray(room.id, doomed)).run();
      for (const id of doomed) dbRooms.delete(id);
    }

    // --- Bestehende Räume ändern ---
    for (const s of state.rooms) {
      const r = dbRooms.get(s.ref);
      if (!r) continue;
      const patch: Partial<RoomRow> = {};
      if (canOutline(r)) {
        const oldTiles = parseTiles(r.tilesJson);
        const tiles = normalizeTiles(s.tiles);
        const move = translation(oldTiles, tiles);
        if (move && (move.dx || move.dy)) {
          // Unsichtbaren Inhalt (fremdes privates Zimmer) mitnehmen
          const hidden = t
            .select()
            .from(householdObject)
            .where(eq(householdObject.roomId, r.id))
            .all()
            .filter((o) => !objectsInPayload.has(o.id));
          for (const o of hidden)
            t.update(householdObject)
              .set({ x: o.x + move.dx, y: o.y + move.dy })
              .where(eq(householdObject.id, o.id))
              .run();
          for (const c of dbRooms.values()) {
            if (c.parentRoomId !== r.id || roomsInPayload.has(c.id)) continue;
            const moved = {
              tilesJson: JSON.stringify(
                shiftTiles(parseTiles(c.tilesJson), move.dx, move.dy),
              ),
              doorsJson: JSON.stringify(
                shiftDoors(parseDoors(c.doorsJson), move.dx, move.dy),
              ),
            };
            t.update(room).set(moved).where(eq(room.id, c.id)).run();
            dbRooms.set(c.id, { ...c, ...moved });
            const childObjects = t
              .select()
              .from(householdObject)
              .where(eq(householdObject.roomId, c.id))
              .all();
            for (const o of childObjects)
              t.update(householdObject)
                .set({ x: o.x + move.dx, y: o.y + move.dy })
                .where(eq(householdObject.id, o.id))
                .run();
          }
        }
        patch.tilesJson = JSON.stringify(tiles);
        patch.doorsJson = JSON.stringify(s.doors);
        patch.name = s.name;
        patch.type = s.type;
        // Besitz wechseln nur Admins, nur bei Zimmern (nicht Unterräumen)
        if (
          isAdmin &&
          !r.parentRoomId &&
          (s.ownerId ?? null) !== r.privateOwnerId
        ) {
          if (s.ownerId)
            assert(
              getMembership(t, input.householdId, s.ownerId),
              "Das Zimmer kann nur einem Mitglied zugewiesen werden.",
            );
          // Beim Wechsel der Besitzerin/des Besitzers wird der private
          // Inhalt gelöscht, damit niemand fremde Daten übernimmt.
          if (r.privateOwnerId) {
            t.delete(room).where(eq(room.parentRoomId, r.id)).run();
            for (const c of [...dbRooms.values()])
              if (c.parentRoomId === r.id) dbRooms.delete(c.id);
            t.delete(householdObject)
              .where(
                and(
                  eq(householdObject.roomId, r.id),
                  eq(householdObject.isFloor, false),
                ),
              )
              .run();
          }
          patch.privateOwnerId = s.ownerId ?? null;
        }
      }
      if (Object.keys(patch).length) {
        t.update(room).set(patch).where(eq(room.id, r.id)).run();
        dbRooms.set(r.id, { ...r, ...patch });
      }
    }

    // --- Neue Räume ---
    const resolveRoom = (refId: string) =>
      ids.get(refId) ?? (dbRooms.has(refId) ? refId : undefined);
    const pending = state.rooms.filter(
      (s) => !dbRooms.has(s.ref) && !ids.has(s.ref),
    );
    // Zimmer vor Unterräumen, damit parentRef aufgelöst werden kann
    pending.sort(
      (a, b) => Number(Boolean(a.parentRef)) - Number(Boolean(b.parentRef)),
    );
    for (const s of pending) {
      let parentId: string | null = null;
      let owner: string | null = null;
      if (s.parentRef) {
        parentId = resolveRoom(s.parentRef) ?? null;
        const parent = parentId ? dbRooms.get(parentId) : undefined;
        assert(
          parent && !parent.parentRoomId && parent.privateOwnerId === actor,
          "Unterräume gibt es nur im eigenen privaten Zimmer.",
        );
        owner = actor;
      } else {
        assert(isAdmin, "Nur Admins dürfen Räume anlegen.");
        if (s.ownerId)
          assert(
            getMembership(t, input.householdId, s.ownerId),
            "Das Zimmer kann nur einem Mitglied zugewiesen werden.",
          );
        owner = s.ownerId ?? null;
      }
      const [created] = t
        .insert(room)
        .values({
          householdId: input.householdId,
          type: s.type as RoomType,
          name: s.name,
          privateOwnerId: owner,
          parentRoomId: parentId,
          tilesJson: JSON.stringify(normalizeTiles(s.tiles)),
          doorsJson: JSON.stringify(s.doors),
        })
        .returning()
        .all();
      ids.set(s.ref, created.id);
      dbRooms.set(created.id, created);
      const [floor] = t
        .insert(householdObject)
        .values({
          householdId: input.householdId,
          roomId: created.id,
          type: FLOOR.type,
          name: FLOOR.name,
          w: 0,
          h: 0,
          isFloor: true,
        })
        .returning()
        .all();
      insertTasks(t, {
        householdId: input.householdId,
        objectId: floor.id,
        suggestions: floorSuggestions(s.type as RoomType),
        now: input.now,
      });
    }

    // --- Grundriss prüfen ---
    const rooms = [...dbRooms.values()];
    const tilesOf = new Map(rooms.map((r) => [r.id, parseTiles(r.tilesJson)]));
    const top = rooms.filter((r) => !r.parentRoomId);
    const seen = new Map<string, string>();
    for (const r of top) {
      const tiles = tilesOf.get(r.id)!;
      assert(
        isConnected(tiles),
        `„${r.name}“ muss zusammenhängen. Für getrennte Flächen bitte einen weiteren Raum anlegen.`,
      );
      for (const [x, y] of tiles) {
        const k = tileKey(x, y);
        const other = seen.get(k);
        assert(!other, `„${r.name}“ überschneidet sich mit „${other}“.`);
        seen.set(k, r.name);
      }
    }
    for (const r of rooms.filter((x) => x.parentRoomId)) {
      const parent = tilesOf.get(r.parentRoomId!);
      const own = tilesOf.get(r.id)!;
      const set = parent ? tileSet(parent) : new Set<string>();
      assert(
        own.every(([x, y]) => set.has(tileKey(x, y))),
        `„${r.name}“ muss innerhalb des Zimmers liegen.`,
      );
    }
    for (const r of rooms) {
      const valid = validDoors(tilesOf.get(r.id)!, parseDoors(r.doorsJson));
      if (valid.length !== parseDoors(r.doorsJson).length)
        t.update(room)
          .set({ doorsJson: JSON.stringify(valid) })
          .where(eq(room.id, r.id))
          .run();
    }

    // --- Gruppen (z. B. Küchenzeile) ---
    const editableRooms = new Set(rooms.filter(canContent).map((r) => r.id));
    const dbGroups = editableRooms.size
      ? t
          .select()
          .from(objectGroup)
          .where(inArray(objectGroup.roomId, [...editableRooms]))
          .all()
      : [];
    const sentGroups = new Set(state.groups.map((g) => g.ref));
    for (const g of dbGroups) {
      ids.set(g.id, g.id);
      if (!sentGroups.has(g.id))
        t.delete(objectGroup).where(eq(objectGroup.id, g.id)).run();
    }
    const knownGroups = new Set(dbGroups.map((g) => g.id));
    for (const g of state.groups) {
      if (knownGroups.has(g.ref)) {
        t.update(objectGroup)
          .set({ name: g.name })
          .where(eq(objectGroup.id, g.ref))
          .run();
        continue;
      }
      const roomId = resolveRoom(g.roomRef);
      if (!roomId || !editableRooms.has(roomId)) continue;
      const [created] = t
        .insert(objectGroup)
        .values({ roomId, name: g.name })
        .returning()
        .all();
      ids.set(g.ref, created.id);
    }

    // --- Möbel ---
    const dbObjects = editableRooms.size
      ? t
          .select()
          .from(householdObject)
          .where(
            and(
              inArray(householdObject.roomId, [...editableRooms]),
              eq(householdObject.isFloor, false),
            ),
          )
          .all()
      : [];
    const dbObjectIds = new Set(dbObjects.map((o) => o.id));
    for (const o of dbObjects)
      if (!objectsInPayload.has(o.id))
        t.delete(householdObject).where(eq(householdObject.id, o.id)).run();

    for (const o of state.objects) {
      const roomId = resolveRoom(o.roomRef);
      if (!roomId || !editableRooms.has(roomId)) continue;
      const groupId = o.groupRef ? (ids.get(o.groupRef) ?? null) : null;
      if (dbObjectIds.has(o.ref)) {
        t.update(householdObject)
          .set({
            roomId,
            x: o.x,
            y: o.y,
            rotation: o.rotation,
            placed: o.placed,
            groupId,
          })
          .where(eq(householdObject.id, o.ref))
          .run();
        ids.set(o.ref, o.ref);
        continue;
      }
      const def = objectDefinition(o.type);
      assert(def && o.type !== FLOOR.type, "Unbekanntes Objekt.");
      const [created] = t
        .insert(householdObject)
        .values({
          householdId: input.householdId,
          roomId,
          groupId,
          type: def.type,
          name: def.name,
          w: def.w,
          h: def.h,
          x: o.x,
          y: o.y,
          rotation: o.rotation,
          placed: o.placed,
        })
        .returning()
        .all();
      ids.set(o.ref, created.id);
      insertTasks(t, {
        householdId: input.householdId,
        objectId: created.id,
        suggestions: def.suggestions,
        now: input.now,
      });
    }

    // --- Möbel prüfen: im eigenen Raum, keine Überschneidung ---
    const placed = t
      .select()
      .from(householdObject)
      .where(
        and(
          eq(householdObject.householdId, input.householdId),
          eq(householdObject.placed, true),
          eq(householdObject.isFloor, false),
        ),
      )
      .all();
    const clusterOf = (roomId: string) => {
      const r = dbRooms.get(roomId);
      return r?.parentRoomId ?? roomId;
    };
    const taken = new Map<string, string>();
    for (const o of placed) {
      const r = dbRooms.get(o.roomId);
      if (!r) continue;
      const roomTiles = tileSet(tilesOf.get(r.id) ?? []);
      const fp: Tile[] = footprintTiles(o);
      const visible = canContent(r);
      assert(
        fp.every(([x, y]) => roomTiles.has(tileKey(x, y))),
        visible
          ? `„${o.name}“ muss ganz in „${r.name}“ stehen.`
          : `In „${r.name}“ steht dort noch etwas. Die Person, der das Zimmer gehört, muss es erst umstellen.`,
      );
      for (const [x, y] of fp) {
        const k = `${clusterOf(r.id)}|${tileKey(x, y)}`;
        assert(
          !taken.has(k),
          `„${o.name}“ überschneidet sich mit „${taken.get(k)}“.`,
        );
        taken.set(k, o.name);
      }
    }

    return { ids: Object.fromEntries(ids) };
  });
}

/**
 * „Zuletzt gemacht?“ im Möbel-Sheet: setzt den Bezugspunkt aller Aufgaben
 * des Objekts, die noch nie erledigt wurden.
 */
export function setObjectLastDone(
  db: DB,
  input: {
    householdId: string;
    viewerId: string;
    objectId: string;
    lastDone: LastDone;
    now: Date;
  },
) {
  const o = getObjectForEdit(db, input);
  const tasks = db.select().from(task).where(eq(task.objectId, o.id)).all();
  const done = new Set(
    tasks.length
      ? db
          .select({ taskId: completion.taskId })
          .from(completion)
          .where(
            inArray(
              completion.taskId,
              tasks.map((t) => t.id),
            ),
          )
          .all()
          .map((c) => c.taskId)
      : [],
  );
  for (const t of tasks) {
    if (done.has(t.id)) continue;
    db.update(task)
      .set({
        baselineAt: initialBaseline(input.lastDone, t.intervalDays, input.now),
      })
      .where(eq(task.id, t.id))
      .run();
  }
}
