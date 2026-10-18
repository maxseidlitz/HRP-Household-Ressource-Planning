"use server";

import { revalidatePath } from "next/cache";
import { parseLocalDateTime, zonedStartOfNextDay } from "@/domain/time";
import { DomainError } from "../errors";
import { requireAdmin, requireHousehold, requireUser } from "../context";
import {
  completeVacationItem,
  createAbsence,
  endAbsence,
  setLinkedTasks,
} from "../queries/absences";
import { track } from "../queries/analytics";
import { cancelCommitment, createCommitment } from "../queries/commitments";
import { markAllRead } from "../queries/notifications";
import { handle, str, type FormState } from "./result";

function localDate(form: FormData, key: string, timeZone: string): Date {
  const d = parseLocalDateTime(str(form, key), timeZone);
  if (!d) throw new DomainError("Bitte Datum und Uhrzeit angeben.");
  return d;
}

/** „Ich mach das“ mit Termin (Spez. 5.6). */
export async function createCommitmentAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireHousehold();
  return handle(() => {
    const taskId = str(form, "taskId");
    createCommitment(ctx.db, {
      householdId: ctx.household.id,
      userId: ctx.user.id,
      taskId,
      plannedFor: localDate(form, "plannedFor", ctx.household.timezone),
      now: new Date(),
    });
    track(ctx.db, {
      name: "commitment_created",
      householdId: ctx.household.id,
      userId: ctx.user.id,
      meta: { taskId },
    });
    revalidatePath("/", "layout");
  });
}

export async function cancelCommitmentAction(form: FormData) {
  const ctx = await requireHousehold();
  cancelCommitment(ctx.db, {
    userId: ctx.user.id,
    commitmentId: str(form, "commitmentId"),
  });
  revalidatePath("/", "layout");
}

/** Urlaub gilt für alle WGs der Person (Spez. 7). */
export async function createAbsenceAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireHousehold();
  const tz = ctx.household.timezone;
  return handle(() => {
    const from = parseLocalDateTime(str(form, "from"), tz);
    const toDay = parseLocalDateTime(str(form, "to"), tz);
    if (!from || !toDay)
      throw new DomainError("Bitte Beginn und Ende angeben.");
    // Das Ende ist inklusive: bis einschließlich zum letzten Tag.
    const to = zonedStartOfNextDay(toDay, tz);
    createAbsence(ctx.db, { userId: ctx.user.id, from, to, now: new Date() });
    track(ctx.db, {
      name: "absence_created",
      householdId: ctx.household.id,
      userId: ctx.user.id,
    });
    revalidatePath("/", "layout");
  });
}

export async function endAbsenceAction(form: FormData) {
  const { db, user } = await requireUser();
  endAbsence(db, {
    userId: user.id,
    absenceId: str(form, "absenceId"),
    now: new Date(),
  });
  revalidatePath("/", "layout");
}

export async function completeVacationItemAction(
  _prev: FormState<number>,
  form: FormData,
): Promise<FormState<number>> {
  const ctx = await requireHousehold();
  return handle(() => {
    const item = str(form, "item");
    if (item !== "fridge" && item !== "vacuumTrash")
      throw new DomainError("Ungültige Anfrage.");
    const points = completeVacationItem(ctx.db, {
      userId: ctx.user.id,
      householdId: ctx.household.id,
      bundleId: str(form, "bundleId"),
      item,
      now: new Date(),
    });
    revalidatePath("/", "layout");
    return points;
  });
}

export async function setLinkedTasksAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireAdmin();
  return handle(() => {
    setLinkedTasks(ctx.db, {
      householdId: ctx.household.id,
      actorId: ctx.user.id,
      taskIds: form.getAll("taskId").map(String),
    });
    revalidatePath("/verwaltung/urlaubspaket");
  });
}

/**
 * Ohne Revalidierung: Die offene Seite markiert weiter, was bei diesem
 * Besuch neu war; die Glocke setzt sich im Browser selbst zurück.
 */
export async function markNotificationsReadAction() {
  const ctx = await requireHousehold();
  markAllRead(ctx.db, {
    userId: ctx.user.id,
    householdId: ctx.household.id,
    now: new Date(),
  });
}
