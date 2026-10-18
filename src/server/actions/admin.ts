"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DomainError } from "../errors";
import { requireAdmin, requireHousehold } from "../context";
import { track } from "../queries/analytics";
import { createFeedback, updateFeedback } from "../queries/feedback";
import { castObjectionVote, fileObjection } from "../queries/objections";
import {
  castFeatureVote,
  setObjectionsEnabled,
  updateThresholds,
} from "../queries/settings";
import { readScreenshot, screenshotPath, writeUpload } from "../uploads";
import { handle, num, str, type FormState } from "./result";

/** Prozentfeld (z. B. „40“) → Anteil (0,4). */
const percent = (form: FormData, key: string) => num(form, key) / 100;

export async function updateThresholdsAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireAdmin();
  return handle(() => {
    updateThresholds(ctx.db, {
      householdId: ctx.household.id,
      actorId: ctx.user.id,
      earlyThreshold: percent(form, "earlyThreshold"),
      lateThreshold: percent(form, "lateThreshold"),
      minProgress: percent(form, "minProgress"),
      icsAlarmMinutes: Math.round(num(form, "icsAlarmMinutes")),
    });
    revalidatePath("/", "layout");
  });
}

export async function setObjectionsEnabledAction(form: FormData) {
  const ctx = await requireAdmin();
  setObjectionsEnabled(ctx.db, {
    householdId: ctx.household.id,
    actorId: ctx.user.id,
    enabled: str(form, "enabled") === "true",
  });
  revalidatePath("/", "layout");
}

/** Abstimmung über die Widerspruchsfunktion (alle Mitglieder). */
export async function castFeatureVoteAction(form: FormData) {
  const ctx = await requireHousehold();
  castFeatureVote(ctx.db, {
    householdId: ctx.household.id,
    userId: ctx.user.id,
    vote: str(form, "vote") === "yes",
  });
  revalidatePath("/", "layout");
}

/** „Nicht erledigt“ in der Historie (Spez. 6.3). */
export async function fileObjectionAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireHousehold();
  const result = await handle(() => {
    const r = fileObjection(ctx.db, {
      householdId: ctx.household.id,
      userId: ctx.user.id,
      completionId: str(form, "completionId"),
      now: new Date(),
    });
    track(ctx.db, {
      name: "objection_filed",
      householdId: ctx.household.id,
      userId: ctx.user.id,
    });
    return r.objectionId;
  });
  if (result?.ok) {
    revalidatePath("/", "layout");
    redirect(`/widerspruch/${result.data}`);
  }
  return result;
}

export async function castObjectionVoteAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireHousehold();
  return handle(() => {
    const vote = str(form, "vote");
    if (vote !== "confirm" && vote !== "reject")
      throw new DomainError("Ungültige Stimme.");
    castObjectionVote(ctx.db, {
      objectionId: str(form, "objectionId"),
      userId: ctx.user.id,
      vote,
      now: new Date(),
    });
    track(ctx.db, {
      name: "objection_vote",
      householdId: ctx.household.id,
      userId: ctx.user.id,
    });
    revalidatePath("/", "layout");
  });
}

/** Feedback senden, optional mit Screenshot ≤ 5 MB (Spez. 9.2). */
export async function createFeedbackAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireHousehold();
  const h = await headers();
  return handle(async () => {
    const id = crypto.randomUUID();
    const shot = await readScreenshot(form.get("screenshot"));
    const rel = shot ? screenshotPath(id, shot) : null;
    createFeedback(ctx.db, {
      id,
      householdId: ctx.household.id,
      userId: ctx.user.id,
      category: str(form, "category"),
      text: str(form, "text"),
      screenshotPath: rel,
      context: {
        screen: str(form, "screen").slice(0, 200) || undefined,
        viewport: str(form, "viewport").slice(0, 20) || undefined,
        userAgent: h.get("user-agent")?.slice(0, 300) ?? undefined,
      },
      now: new Date(),
    });
    // Erst nach erfolgreicher Prüfung schreiben, damit nichts verwaist.
    if (shot && rel) writeUpload(rel, shot.bytes);
    track(ctx.db, {
      name: "feedback_sent",
      householdId: ctx.household.id,
      userId: ctx.user.id,
    });
    revalidatePath("/feedback");
  });
}

export async function updateFeedbackAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireAdmin();
  return handle(() => {
    updateFeedback(ctx.db, {
      householdId: ctx.household.id,
      actorId: ctx.user.id,
      ticketId: str(form, "ticketId"),
      status: str(form, "status"),
      adminNote: str(form, "adminNote"),
      adminReply: str(form, "adminReply"),
      now: new Date(),
    });
    revalidatePath("/verwaltung/feedback");
  });
}
