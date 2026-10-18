import { and, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { commitment, user } from "@/db/schema";
import { assert } from "../errors";
import { getTaskView } from "./tasks";

export { openCommitmentsFor, type OpenCommitment } from "./tasks";

/**
 * „Ich mach das“ (Spez. 5.6): pro Aufgabe höchstens eine offene
 * Einplanung. Eigene Einplanungen lassen sich verschieben.
 */
export function createCommitment(
  db: DB,
  input: {
    householdId: string;
    userId: string;
    taskId: string;
    plannedFor: Date;
    now: Date;
  },
) {
  const view = getTaskView(db, {
    householdId: input.householdId,
    viewerId: input.userId,
    taskId: input.taskId,
    now: input.now,
  });
  assert(view, "Aufgabe nicht gefunden.");
  assert(view.active, "Diese Aufgabe ist pausiert.");
  assert(
    input.plannedFor.getTime() > input.now.getTime() - 60 * 60 * 1000,
    "Bitte einen Zeitpunkt in der Zukunft wählen.",
  );
  assert(
    input.plannedFor.getTime() < input.now.getTime() + 90 * 86_400_000,
    "Bitte höchstens 90 Tage im Voraus einplanen.",
  );
  return db.transaction((tx) => {
    const open = tx
      .select({ id: commitment.id, userId: commitment.userId, name: user.name })
      .from(commitment)
      .innerJoin(user, eq(user.id, commitment.userId))
      .where(and(eq(commitment.taskId, view.id), eq(commitment.status, "open")))
      .get();
    if (open) {
      assert(
        open.userId === input.userId,
        `${open.name} hat diese Aufgabe schon eingeplant.`,
      );
      tx.update(commitment)
        .set({ status: "cancelled" })
        .where(eq(commitment.id, open.id))
        .run();
    }
    const [c] = tx
      .insert(commitment)
      .values({
        taskId: view.id,
        userId: input.userId,
        plannedFor: input.plannedFor,
      })
      .returning()
      .all();
    return { ...c, taskName: view.name };
  });
}

export function cancelCommitment(
  db: DB,
  input: { userId: string; commitmentId: string },
) {
  const c = db
    .select()
    .from(commitment)
    .where(eq(commitment.id, input.commitmentId))
    .get();
  assert(
    c && c.userId === input.userId,
    "Nur eigene Einplanungen lassen sich absagen.",
  );
  db.update(commitment)
    .set({ status: "cancelled" })
    .where(and(eq(commitment.id, c.id), eq(commitment.status, "open")))
    .run();
}

/** Für den .ics-Download: nur eigene oder sichtbare Einplanungen. */
export function getCommitmentForIcs(
  db: DB,
  input: {
    householdId: string;
    viewerId: string;
    commitmentId: string;
    now: Date;
  },
) {
  const c = db
    .select()
    .from(commitment)
    .where(eq(commitment.id, input.commitmentId))
    .get();
  if (!c) return null;
  const view = getTaskView(db, {
    householdId: input.householdId,
    viewerId: input.viewerId,
    taskId: c.taskId,
    now: input.now,
  });
  if (!view) return null;
  return { commitment: c, task: view };
}
