import { and, desc, eq, gte, inArray, isNull, max } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  commitment,
  completion,
  household,
  householdObject,
  membership,
  room,
  task,
  user,
} from "@/db/schema";
import type { RoomType } from "@/catalog/rooms";
import {
  leaderboard,
  periodStart,
  type LeaderboardPeriod,
} from "@/domain/leaderboard";
import { pointsFor } from "@/domain/points";
import {
  dueAt,
  progress,
  startPoint,
  statusColor,
  taskStatus,
  type TaskStatus,
} from "@/domain/progress";
import { parseSettings, resolveThresholds } from "@/domain/settings";
import { assert } from "../errors";
import { vacationScores } from "./absences";
import { visibleTo } from "./rooms";

export type TaskView = {
  id: string;
  name: string;
  intervalDays: number;
  multiplier: number;
  active: boolean;
  objectId: string;
  objectName: string;
  objectType: string;
  roomId: string;
  roomName: string;
  roomType: RoomType;
  isPrivate: boolean;
  lastCompletedAt: Date | null;
  dueAt: Date;
  progress: number;
  status: TaskStatus;
  color: string;
  /** Punkte, wenn die Aufgabe jetzt erledigt wird. */
  pointsNow: number;
  /** Offene Einplanung („Ich mach das“), Spez. 5.6. */
  commitment: OpenCommitment | null;
};

export type OpenCommitment = {
  id: string;
  taskId: string;
  userId: string;
  userName: string;
  avatarJson: string | null;
  plannedFor: Date;
};

export function openCommitmentsFor(
  db: DB,
  taskIds: string[],
): Map<string, OpenCommitment> {
  if (taskIds.length === 0) return new Map();
  const rows = db
    .select({
      id: commitment.id,
      taskId: commitment.taskId,
      userId: commitment.userId,
      plannedFor: commitment.plannedFor,
      userName: user.name,
      avatarJson: user.avatarJson,
    })
    .from(commitment)
    .innerJoin(user, eq(user.id, commitment.userId))
    .where(
      and(inArray(commitment.taskId, taskIds), eq(commitment.status, "open")),
    )
    .all();
  return new Map(rows.map((r) => [r.taskId, r]));
}

/**
 * Alle für die Person sichtbaren Aufgaben der WG inkl. berechnetem Status
 * (Spez. 5.2/5.3). Sortiert nach Dringlichkeit, pausierte zuletzt.
 */
export function listTaskViews(
  db: DB,
  input: { householdId: string; viewerId: string; now: Date; taskId?: string },
): TaskView[] {
  const h = db
    .select({ settingsJson: household.settingsJson })
    .from(household)
    .where(eq(household.id, input.householdId))
    .get();
  assert(h, "WG nicht gefunden.");
  const settings = parseSettings(h.settingsJson);

  const rows = db
    .select({ task, object: householdObject, room })
    .from(task)
    .innerJoin(householdObject, eq(householdObject.id, task.objectId))
    .innerJoin(room, eq(room.id, householdObject.roomId))
    .where(
      and(
        eq(task.householdId, input.householdId),
        visibleTo(input.viewerId),
        input.taskId ? eq(task.id, input.taskId) : undefined,
      ),
    )
    .all();
  if (rows.length === 0) return [];

  const lastDone = new Map(
    db
      .select({ taskId: completion.taskId, at: max(completion.completedAt) })
      .from(completion)
      .where(
        and(
          inArray(
            completion.taskId,
            rows.map((r) => r.task.id),
          ),
          eq(completion.status, "valid"),
        ),
      )
      .groupBy(completion.taskId)
      .all()
      .map((r) => [r.taskId, r.at]),
  );

  const commitments = openCommitmentsFor(
    db,
    rows.map((r) => r.task.id),
  );

  return rows
    .map(({ task: t, object: o, room: r }) => {
      const last = lastDone.get(t.id) ?? null;
      const start = startPoint(t.baselineAt, last);
      const thresholds = resolveThresholds(settings, t);
      // Pausierte Aufgaben bleiben auf dem Stand beim Pausieren stehen.
      const p = progress(start, t.intervalDays, t.pausedAt ?? input.now);
      return {
        id: t.id,
        name: t.name,
        intervalDays: t.intervalDays,
        multiplier: t.multiplier,
        active: t.active,
        objectId: o.id,
        objectName: o.name,
        objectType: o.type,
        roomId: r.id,
        roomName: r.name,
        roomType: r.type,
        isPrivate: r.privateOwnerId !== null,
        lastCompletedAt: last,
        dueAt: dueAt(start, t.intervalDays),
        progress: p,
        status: taskStatus(p, thresholds, t.active),
        color: statusColor(p),
        pointsNow: r.privateOwnerId
          ? 0
          : pointsFor(p, t.multiplier, thresholds),
        commitment: commitments.get(t.id) ?? null,
      } satisfies TaskView;
    })
    .sort(
      (a, b) => Number(b.active) - Number(a.active) || b.progress - a.progress,
    );
}

export function getTaskView(
  db: DB,
  input: { householdId: string; viewerId: string; taskId: string; now: Date },
) {
  return listTaskViews(db, input)[0];
}

export function taskHistory(db: DB, taskId: string, limit = 10) {
  return db
    .select({
      id: completion.id,
      completedAt: completion.completedAt,
      points: completion.points,
      progress: completion.progressAtCompletion,
      status: completion.status,
      source: completion.source,
      userId: user.id,
      userName: user.name,
      avatarJson: user.avatarJson,
    })
    .from(completion)
    .innerJoin(user, eq(user.id, completion.userId))
    .where(eq(completion.taskId, taskId))
    .orderBy(desc(completion.completedAt))
    .limit(limit)
    .all();
}

export type CompleteResult = {
  completionId: string;
  points: number;
  progress: number;
  belowMinimum: boolean;
  duplicate: boolean;
  taskName: string;
  isPrivate: boolean;
};

/**
 * Erledigen (Spez. 5.5). Doppelte Absendungen mit demselben
 * Idempotenz-Schlüssel liefern das erste Ergebnis zurück.
 */
export function completeTask(
  db: DB,
  input: {
    householdId: string;
    userId: string;
    taskId: string;
    idempotencyKey: string;
    now: Date;
  },
): CompleteResult {
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(completion)
      .where(eq(completion.idempotencyKey, input.idempotencyKey))
      .get();
    if (existing) {
      assert(existing.userId === input.userId, "Ungültige Anfrage.");
      return {
        completionId: existing.id,
        points: existing.points,
        progress: existing.progressAtCompletion,
        belowMinimum: existing.points === 0,
        duplicate: true,
        taskName: "",
        isPrivate: false,
      };
    }

    const view = listTaskViews(tx as unknown as DB, {
      householdId: input.householdId,
      viewerId: input.userId,
      now: input.now,
      taskId: input.taskId,
    })[0];
    assert(view, "Aufgabe nicht gefunden.");
    assert(view.active, "Diese Aufgabe ist pausiert.");

    const [c] = tx
      .insert(completion)
      .values({
        taskId: view.id,
        userId: input.userId,
        completedAt: input.now,
        progressAtCompletion: view.progress,
        points: view.pointsNow,
        idempotencyKey: input.idempotencyKey,
      })
      .returning()
      .all();

    // Eine offene Einplanung gilt als erfüllt, egal wer erledigt (Spez. 5.6).
    tx.update(commitment)
      .set({ status: "fulfilled" })
      .where(and(eq(commitment.taskId, view.id), eq(commitment.status, "open")))
      .run();

    return {
      completionId: c.id,
      points: c.points,
      progress: view.progress,
      belowMinimum: !view.isPrivate && c.points === 0,
      duplicate: false,
      taskName: view.name,
      isPrivate: view.isPrivate,
    };
  });
}

/** Rangliste der WG mit Rohpunkten (Spez. 6.2). */
export function householdLeaderboard(
  db: DB,
  input: { householdId: string; period: LeaderboardPeriod; now: Date },
) {
  const h = db
    .select({ timezone: household.timezone })
    .from(household)
    .where(eq(household.id, input.householdId))
    .get();
  assert(h, "WG nicht gefunden.");
  const since = periodStart(input.period, input.now, h.timezone);

  const members = db
    .select({ userId: membership.userId })
    .from(membership)
    .where(eq(membership.householdId, input.householdId))
    .all()
    .map((m) => m.userId);

  // Private Zimmer zählen nie (Spez. 4.2).
  const completions = db
    .select({
      userId: completion.userId,
      points: completion.points,
      completedAt: completion.completedAt,
      status: completion.status,
    })
    .from(completion)
    .innerJoin(task, eq(task.id, completion.taskId))
    .innerJoin(householdObject, eq(householdObject.id, task.objectId))
    .innerJoin(room, eq(room.id, householdObject.roomId))
    .where(
      and(
        eq(task.householdId, input.householdId),
        isNull(room.privateOwnerId),
        since ? gte(completion.completedAt, since) : undefined,
      ),
    )
    .all();

  // Urlaubspaket-Punkte zählen wie Erledigungen (Spez. 7).
  return leaderboard(
    members,
    [...completions, ...vacationScores(db, input.householdId)],
    since,
  );
}
