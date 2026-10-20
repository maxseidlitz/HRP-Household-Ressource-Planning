import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  commitment,
  completion,
  householdObject,
  objection,
  room,
  task,
} from "@/db/schema";
import { getHousehold, listMembers } from "./households";
import { requireAdminMembership } from "./members";

/**
 * Datenexport als JSON (Spez. 9.3): alles aus den Gemeinschaftsräumen,
 * private Zimmer bleiben außen vor.
 */
export function exportHousehold(
  db: DB,
  input: { householdId: string; actorId: string; now: Date },
) {
  requireAdminMembership(
    db,
    input.householdId,
    input.actorId,
    "Nur Admins dürfen exportieren.",
  );
  const h = getHousehold(db, input.householdId)!;

  const rooms = db
    .select()
    .from(room)
    .where(and(eq(room.householdId, h.id), isNull(room.privateOwnerId)))
    .all();
  const roomIds = rooms.map((r) => r.id);
  const objects = roomIds.length
    ? db
        .select()
        .from(householdObject)
        .where(inArray(householdObject.roomId, roomIds))
        .all()
    : [];
  const objectIds = objects.map((o) => o.id);
  const tasks = objectIds.length
    ? db.select().from(task).where(inArray(task.objectId, objectIds)).all()
    : [];
  const taskIds = tasks.map((t) => t.id);
  const completions = taskIds.length
    ? db
        .select()
        .from(completion)
        .where(inArray(completion.taskId, taskIds))
        .all()
    : [];
  const commitments = taskIds.length
    ? db
        .select()
        .from(commitment)
        .where(inArray(commitment.taskId, taskIds))
        .all()
    : [];
  const completionIds = completions.map((c) => c.id);
  const objections = completionIds.length
    ? db
        .select()
        .from(objection)
        .where(inArray(objection.completionId, completionIds))
        .all()
    : [];

  return {
    format: "hrp-export",
    version: 1,
    exportedAt: input.now.toISOString(),
    household: {
      id: h.id,
      name: h.name,
      emoji: h.emoji,
      timezone: h.timezone,
      expectedMemberCount: h.expectedMemberCount,
      createdAt: h.createdAt,
      settings: h.settings,
    },
    members: listMembers(db, h.id).map((m) => ({
      userId: m.userId,
      name: m.name,
      username: m.username,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
    rooms: rooms.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      parentRoomId: r.parentRoomId,
      tiles: JSON.parse(r.tilesJson) as unknown,
      doors: JSON.parse(r.doorsJson) as unknown,
    })),
    objects,
    tasks,
    completions: completions.map((c) => ({
      id: c.id,
      taskId: c.taskId,
      userId: c.userId,
      completedAt: c.completedAt,
      progressAtCompletion: c.progressAtCompletion,
      points: c.points,
      status: c.status,
      source: c.source,
    })),
    commitments,
    objections,
  };
}
