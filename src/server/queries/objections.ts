import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  completion,
  household,
  householdObject,
  membership,
  objection,
  objectionVote,
  room,
  task,
  user,
} from "@/db/schema";
import {
  evaluateObjection,
  objectionBlocker,
  VOTING_WINDOW_MS,
  type Resolution,
  type Vote,
} from "@/domain/objection";
import { parseSettings } from "@/domain/settings";
import { assert } from "../errors";
import { awayUserIds } from "./absences";
import { notify } from "./notifications";

/** Erledigung mit Aufgabe, Raum und WG – Basis für alle Prüfungen. */
function loadCompletion(db: DB, completionId: string) {
  return db
    .select({
      completion,
      taskName: task.name,
      taskId: task.id,
      householdId: task.householdId,
      privateOwnerId: room.privateOwnerId,
      settingsJson: household.settingsJson,
      completerName: user.name,
    })
    .from(completion)
    .innerJoin(task, eq(task.id, completion.taskId))
    .innerJoin(householdObject, eq(householdObject.id, task.objectId))
    .innerJoin(room, eq(room.id, householdObject.roomId))
    .innerJoin(household, eq(household.id, task.householdId))
    .innerJoin(user, eq(user.id, completion.userId))
    .where(eq(completion.id, completionId))
    .get();
}

/**
 * Stimmberechtigt: alle Mitglieder außer der erledigenden Person, die beim
 * Widerspruch nicht im Urlaub waren (Spez. 6.3).
 */
function eligibleVoters(
  db: DB,
  input: { householdId: string; completerId: string; at: Date },
): string[] {
  const ids = db
    .select({ userId: membership.userId })
    .from(membership)
    .where(eq(membership.householdId, input.householdId))
    .all()
    .map((m) => m.userId)
    .filter((id) => id !== input.completerId);
  const away = awayUserIds(db, ids, input.at);
  return ids.filter((id) => !away.has(id));
}

export function canObject(
  db: DB,
  input: { viewerId: string; completionId: string; now: Date },
): string | null {
  const row = loadCompletion(db, input.completionId);
  if (!row) return "Erledigung nicht gefunden.";
  const isMember = getMember(db, row.householdId, input.viewerId);
  if (!isMember) return "Erledigung nicht gefunden.";
  return objectionBlocker({
    enabled: parseSettings(row.settingsJson).objectionsEnabled,
    viewerId: input.viewerId,
    completion: row.completion,
    isPrivate: row.privateOwnerId !== null,
    viewerAway: awayUserIds(db, [input.viewerId], input.now).has(
      input.viewerId,
    ),
    now: input.now,
  });
}

function getMember(db: DB, householdId: string, userId: string) {
  return db
    .select()
    .from(membership)
    .where(
      and(
        eq(membership.householdId, householdId),
        eq(membership.userId, userId),
      ),
    )
    .get();
}

/**
 * „Nicht erledigt“: Punkte werden eingefroren, die erledigende Person
 * benachrichtigt, alle Stimmberechtigten bekommen eine Abstimmung.
 */
export function fileObjection(
  db: DB,
  input: {
    householdId: string;
    userId: string;
    completionId: string;
    now: Date;
  },
) {
  const blocker = canObject(db, {
    viewerId: input.userId,
    completionId: input.completionId,
    now: input.now,
  });
  assert(!blocker, blocker ?? "");
  const row = loadCompletion(db, input.completionId)!;
  assert(row.householdId === input.householdId, "Erledigung nicht gefunden.");

  const id = db.transaction((tx) => {
    const t = tx as unknown as DB;
    const [o] = tx
      .insert(objection)
      .values({
        completionId: input.completionId,
        createdByUserId: input.userId,
        deadlineAt: new Date(input.now.getTime() + VOTING_WINDOW_MS),
        createdAt: input.now,
      })
      .returning()
      .all();
    tx.update(completion)
      .set({ status: "contested" })
      .where(eq(completion.id, input.completionId))
      .run();
    tx.insert(objectionVote)
      .values({ objectionId: o.id, userId: input.userId, vote: "reject" })
      .run();

    const objector = tx
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, input.userId))
      .get();
    notify(tx, {
      userId: row.completion.userId,
      householdId: row.householdId,
      type: "objection_filed",
      payload: {
        objectionId: o.id,
        taskName: row.taskName,
        userName: objector?.name ?? "Jemand",
      },
    });
    for (const voter of eligibleVoters(t, {
      householdId: row.householdId,
      completerId: row.completion.userId,
      at: input.now,
    })) {
      if (voter === input.userId) continue;
      notify(tx, {
        userId: voter,
        householdId: row.householdId,
        type: "objection_vote",
        payload: {
          objectionId: o.id,
          taskName: row.taskName,
          completerName: row.completerName,
        },
      });
    }
    return o.id;
  });
  const resolution = resolveObjection(db, id, input.now);
  return { objectionId: id, resolution };
}

export function castObjectionVote(
  db: DB,
  input: { objectionId: string; userId: string; vote: Vote; now: Date },
) {
  const view = getObjectionView(db, {
    objectionId: input.objectionId,
    viewerId: input.userId,
    now: input.now,
  });
  assert(view, "Abstimmung nicht gefunden.");
  assert(!view.resolution, "Die Abstimmung ist schon beendet.");
  assert(view.canVote, "Du bist bei dieser Abstimmung nicht stimmberechtigt.");
  db.insert(objectionVote)
    .values({
      objectionId: input.objectionId,
      userId: input.userId,
      vote: input.vote,
    })
    .onConflictDoUpdate({
      target: [objectionVote.objectionId, objectionVote.userId],
      set: { vote: input.vote },
    })
    .run();
  return resolveObjection(db, input.objectionId, input.now);
}

/**
 * Wertet aus und schließt ab, sobald das Ergebnis feststeht oder die Frist
 * vorbei ist. „Nicht erledigt“ setzt die Erledigung zurück: Punkte
 * entfallen, die Fälligkeit springt zurück.
 */
export function resolveObjection(
  db: DB,
  objectionId: string,
  now: Date,
): Resolution | null {
  const o = db
    .select()
    .from(objection)
    .where(eq(objection.id, objectionId))
    .get();
  if (!o || o.resolution) return o?.resolution ?? null;
  const row = loadCompletion(db, o.completionId);
  if (!row) return null;
  const eligible = eligibleVoters(db, {
    householdId: row.householdId,
    completerId: row.completion.userId,
    at: o.createdAt,
  });
  const votes = new Map(
    db
      .select({ userId: objectionVote.userId, vote: objectionVote.vote })
      .from(objectionVote)
      .where(eq(objectionVote.objectionId, objectionId))
      .all()
      .map((v) => [v.userId, v.vote]),
  );
  const result = evaluateObjection({
    eligible,
    votes,
    deadlinePassed: now >= o.deadlineAt,
  });
  if (!result) return null;

  db.transaction((tx) => {
    tx.update(objection)
      .set({ resolution: result, resolvedAt: now })
      .where(eq(objection.id, objectionId))
      .run();
    tx.update(completion)
      .set({ status: result })
      .where(eq(completion.id, o.completionId))
      .run();
    for (const userId of new Set([row.completion.userId, o.createdByUserId]))
      notify(tx, {
        userId,
        householdId: row.householdId,
        type: "objection_resolved",
        payload: { objectionId, taskName: row.taskName, resolution: result },
        dedupeKey: `objection-resolved:${objectionId}:${userId}`,
      });
  });
  return result;
}

/** Scheduler: abgelaufene Abstimmungen abschließen. */
export function runObjectionJobs(db: DB, now: Date) {
  const due = db
    .select({ id: objection.id })
    .from(objection)
    .where(and(isNull(objection.resolvedAt), lte(objection.deadlineAt, now)))
    .all();
  for (const o of due) resolveObjection(db, o.id, now);
  return due.length;
}

export type ObjectionView = NonNullable<ReturnType<typeof getObjectionView>>;

export function getObjectionView(
  db: DB,
  input: { objectionId: string; viewerId: string; now: Date },
) {
  const o = db
    .select()
    .from(objection)
    .where(eq(objection.id, input.objectionId))
    .get();
  if (!o) return null;
  const row = loadCompletion(db, o.completionId);
  if (!row || !getMember(db, row.householdId, input.viewerId)) return null;
  const eligible = eligibleVoters(db, {
    householdId: row.householdId,
    completerId: row.completion.userId,
    at: o.createdAt,
  });
  const votes = db
    .select({
      userId: objectionVote.userId,
      vote: objectionVote.vote,
      name: user.name,
      avatarJson: user.avatarJson,
    })
    .from(objectionVote)
    .innerJoin(user, eq(user.id, objectionVote.userId))
    .where(eq(objectionVote.objectionId, o.id))
    .all()
    .filter((v) => eligible.includes(v.userId));
  const objector = db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, o.createdByUserId))
    .get();
  return {
    id: o.id,
    householdId: row.householdId,
    taskId: row.taskId,
    taskName: row.taskName,
    completerId: row.completion.userId,
    completerName: row.completerName,
    completedAt: row.completion.completedAt,
    points: row.completion.points,
    objectorName: objector?.name ?? "",
    deadlineAt: o.deadlineAt,
    resolution: o.resolution,
    resolvedAt: o.resolvedAt,
    eligibleCount: eligible.length,
    votes,
    reject: votes.filter((v) => v.vote === "reject").length,
    confirm: votes.filter((v) => v.vote === "confirm").length,
    canVote: !o.resolution && eligible.includes(input.viewerId),
    myVote: votes.find((v) => v.userId === input.viewerId)?.vote ?? null,
  };
}

/** Offene Abstimmungen, bei denen die Person noch nicht abgestimmt hat. */
export function pendingVotesFor(
  db: DB,
  input: { householdId: string; viewerId: string; now: Date },
) {
  const open = db
    .select({ id: objection.id })
    .from(objection)
    .innerJoin(completion, eq(completion.id, objection.completionId))
    .innerJoin(task, eq(task.id, completion.taskId))
    .where(
      and(
        eq(task.householdId, input.householdId),
        isNull(objection.resolvedAt),
      ),
    )
    .all();
  return open
    .map((o) =>
      getObjectionView(db, {
        objectionId: o.id,
        viewerId: input.viewerId,
        now: input.now,
      }),
    )
    .filter((v): v is ObjectionView => Boolean(v?.canVote && !v.myVote));
}

/** Widerspruch je Erledigung, für die Historie. */
export function objectionsByCompletion(db: DB, completionIds: string[]) {
  if (completionIds.length === 0) return new Map<string, string>();
  return new Map(
    db
      .select({ id: objection.id, completionId: objection.completionId })
      .from(objection)
      .where(inArray(objection.completionId, completionIds))
      .all()
      .map((o) => [o.completionId, o.id]),
  );
}
