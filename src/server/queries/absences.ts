import { and, asc, eq, gt, inArray, lte } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  absence,
  commitment,
  completion,
  household,
  householdObject,
  membership,
  room,
  task,
  vacationBundle,
  vacationLinkedTask,
} from "@/db/schema";
import { defaultLinkedTasks, VACATION_POINTS } from "@/domain/vacation";
import { assert } from "../errors";
import { requireAdminMembership } from "./members";

const MAX_DAYS = 120;

/**
 * Urlaub eintragen (Spez. 7). Gilt für alle WGs der Person; für jede WG
 * entsteht ein Urlaubspaket, solange der Urlaub noch nicht begonnen hat.
 */
export function createAbsence(
  db: DB,
  input: { userId: string; from: Date; to: Date; now: Date },
) {
  assert(input.to > input.from, "Das Ende muss nach dem Beginn liegen.");
  assert(input.to > input.now, "Der Urlaub darf nicht schon vorbei sein.");
  assert(
    input.to.getTime() - input.from.getTime() <= MAX_DAYS * 86_400_000,
    `Bitte höchstens ${MAX_DAYS} Tage am Stück eintragen.`,
  );
  const overlapping = db
    .select()
    .from(absence)
    .where(
      and(
        eq(absence.userId, input.userId),
        gt(absence.to, input.from),
        lte(absence.from, input.to),
      ),
    )
    .all()
    .filter((a) => a.from < input.to);
  assert(
    overlapping.length === 0,
    "Für diesen Zeitraum ist schon Urlaub eingetragen.",
  );

  return db.transaction((tx) => {
    const [a] = tx
      .insert(absence)
      .values({ userId: input.userId, from: input.from, to: input.to })
      .returning()
      .all();
    if (input.from > input.now) {
      const households = tx
        .select({ id: membership.householdId })
        .from(membership)
        .where(eq(membership.userId, input.userId))
        .all();
      for (const h of households) {
        tx.insert(vacationBundle)
          .values({ absenceId: a.id, householdId: h.id })
          .run();
      }
    }
    return a;
  });
}

export function listAbsences(db: DB, input: { userId: string; now: Date }) {
  return db
    .select()
    .from(absence)
    .where(and(eq(absence.userId, input.userId), gt(absence.to, input.now)))
    .orderBy(asc(absence.from))
    .all();
}

/** Künftigen Urlaub löschen, laufenden jetzt beenden. */
export function endAbsence(
  db: DB,
  input: { userId: string; absenceId: string; now: Date },
) {
  const a = db
    .select()
    .from(absence)
    .where(eq(absence.id, input.absenceId))
    .get();
  assert(a && a.userId === input.userId, "Urlaub nicht gefunden.");
  if (a.from > input.now) {
    db.delete(absence).where(eq(absence.id, a.id)).run();
  } else {
    db.update(absence).set({ to: input.now }).where(eq(absence.id, a.id)).run();
  }
}

/** Wer ist gerade abwesend? */
export function awayUserIds(db: DB, userIds: string[], now: Date): Set<string> {
  if (userIds.length === 0) return new Set();
  return new Set(
    db
      .select({ userId: absence.userId })
      .from(absence)
      .where(
        and(
          inArray(absence.userId, userIds),
          lte(absence.from, now),
          gt(absence.to, now),
        ),
      )
      .all()
      .map((r) => r.userId),
  );
}

/** Aufgaben, die „Saugen + Müll“ zurücksetzt: Admin-Auswahl oder Standard. */
export function linkedTaskIds(db: DB, householdId: string): string[] {
  const configured = db
    .select({ taskId: vacationLinkedTask.taskId })
    .from(vacationLinkedTask)
    .where(eq(vacationLinkedTask.householdId, householdId))
    .all()
    .map((r) => r.taskId);
  if (configured.length) return configured;
  return defaultLinkedTasks(linkCandidates(db, householdId));
}

export function linkCandidates(db: DB, householdId: string) {
  return db
    .select({
      id: task.id,
      name: task.name,
      objectType: householdObject.type,
      objectName: householdObject.name,
      roomName: room.name,
      privateOwnerId: room.privateOwnerId,
    })
    .from(task)
    .innerJoin(householdObject, eq(householdObject.id, task.objectId))
    .innerJoin(room, eq(room.id, householdObject.roomId))
    .where(eq(task.householdId, householdId))
    .all()
    .map((t) => ({ ...t, isPrivate: t.privateOwnerId !== null }))
    .filter((t) => !t.isPrivate);
}

export function setLinkedTasks(
  db: DB,
  input: { householdId: string; actorId: string; taskIds: string[] },
) {
  requireAdminMembership(
    db,
    input.householdId,
    input.actorId,
    "Nur Admins dürfen das Urlaubspaket einstellen.",
  );
  const allowed = new Set(
    linkCandidates(db, input.householdId).map((t) => t.id),
  );
  assert(
    input.taskIds.every((id) => allowed.has(id)),
    "Unbekannte Aufgabe.",
  );
  db.transaction((tx) => {
    tx.delete(vacationLinkedTask)
      .where(eq(vacationLinkedTask.householdId, input.householdId))
      .run();
    for (const taskId of input.taskIds) {
      tx.insert(vacationLinkedTask)
        .values({ householdId: input.householdId, taskId })
        .run();
    }
  });
}

/** Offene und erledigte Urlaubspakete der Person in dieser WG. */
export function bundlesFor(
  db: DB,
  input: { userId: string; householdId: string; now: Date },
) {
  return db
    .select({ bundle: vacationBundle, absence })
    .from(vacationBundle)
    .innerJoin(absence, eq(absence.id, vacationBundle.absenceId))
    .where(
      and(
        eq(absence.userId, input.userId),
        eq(vacationBundle.householdId, input.householdId),
        gt(absence.to, input.now),
      ),
    )
    .orderBy(asc(absence.from))
    .all();
}

/**
 * Häkchen im Urlaubspaket (Spez. 7). „Saugen + Müll“ setzt die verknüpften
 * Aufgaben auf grün, ohne reguläre Punkte (keine Doppelzählung).
 */
export function completeVacationItem(
  db: DB,
  input: {
    userId: string;
    householdId: string;
    bundleId: string;
    item: "fridge" | "vacuumTrash";
    now: Date;
  },
) {
  const row = db
    .select({ bundle: vacationBundle, absence })
    .from(vacationBundle)
    .innerJoin(absence, eq(absence.id, vacationBundle.absenceId))
    .where(
      and(
        eq(vacationBundle.id, input.bundleId),
        eq(vacationBundle.householdId, input.householdId),
      ),
    )
    .get();
  assert(
    row && row.absence.userId === input.userId,
    "Urlaubspaket nicht gefunden.",
  );
  const field = input.item === "fridge" ? "fridgeDoneAt" : "vacuumTrashDoneAt";
  assert(!row.bundle[field], "Schon erledigt.");
  const points = VACATION_POINTS[input.item];

  db.transaction((tx) => {
    tx.update(vacationBundle)
      .set({ [field]: input.now, points: row.bundle.points + points })
      .where(eq(vacationBundle.id, row.bundle.id))
      .run();
    if (input.item === "vacuumTrash") {
      for (const taskId of linkedTaskIds(tx, input.householdId)) {
        tx.insert(completion)
          .values({
            taskId,
            userId: input.userId,
            completedAt: input.now,
            progressAtCompletion: 0,
            points: 0,
            source: "vacation",
          })
          .run();
        tx.update(commitment)
          .set({ status: "fulfilled" })
          .where(
            and(eq(commitment.taskId, taskId), eq(commitment.status, "open")),
          )
          .run();
      }
    }
  });
  return points;
}

/** Bonuspunkte aus Urlaubspaketen für die Rangliste. */
export function vacationScores(db: DB, householdId: string) {
  const rows = db
    .select({ bundle: vacationBundle, userId: absence.userId })
    .from(vacationBundle)
    .innerJoin(absence, eq(absence.id, vacationBundle.absenceId))
    .innerJoin(household, eq(household.id, vacationBundle.householdId))
    .where(eq(vacationBundle.householdId, householdId))
    .all();
  return rows.flatMap((r) => [
    ...(r.bundle.fridgeDoneAt
      ? [
          {
            userId: r.userId,
            points: VACATION_POINTS.fridge,
            completedAt: r.bundle.fridgeDoneAt,
            status: "valid" as const,
          },
        ]
      : []),
    ...(r.bundle.vacuumTrashDoneAt
      ? [
          {
            userId: r.userId,
            points: VACATION_POINTS.vacuumTrash,
            completedAt: r.bundle.vacuumTrashDoneAt,
            status: "valid" as const,
          },
        ]
      : []),
  ]);
}
