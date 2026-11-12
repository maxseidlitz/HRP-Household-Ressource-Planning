"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DomainError } from "../errors";
import { requireHousehold } from "../context";
import { track } from "../queries/analytics";
import {
  buildStateSchema,
  saveBuild,
  setObjectLastDone,
} from "../queries/build";
import { setTaskActive, updateTask } from "../queries/rooms";
import { getTaskView } from "../queries/tasks";

export type SaveBuildResult =
  { ok: true; ids: Record<string, string> } | { ok: false; error: string };

/** Baumodus: den ganzen bearbeiteten Stand speichern (Autosave). */
export async function saveBuildAction(
  input: unknown,
): Promise<SaveBuildResult> {
  const ctx = await requireHousehold();
  const parsed = buildStateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültiger Grundriss." };
  try {
    const { ids } = saveBuild(ctx.db, {
      householdId: ctx.household.id,
      actorId: ctx.user.id,
      now: new Date(),
      state: parsed.data,
    });
    track(ctx.db, {
      name: "build_saved",
      householdId: ctx.household.id,
      userId: ctx.user.id,
    });
    revalidatePath("/", "layout");
    return { ok: true, ids };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    throw e;
  }
}

const taskPatch = z.object({
  taskId: z.string().min(1),
  active: z.boolean().optional(),
  intervalDays: z.number().min(0.5).max(365).optional(),
});

/** Aufgabe im Möbel-Sheet an- oder abwählen bzw. das Intervall ändern. */
export async function updateBuildTaskAction(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireHousehold();
  const parsed = taskPatch.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Anfrage." };
  const { taskId, active, intervalDays } = parsed.data;
  const base = { householdId: ctx.household.id, viewerId: ctx.user.id, taskId };
  try {
    if (active !== undefined)
      setTaskActive(ctx.db, { ...base, active, now: new Date() });
    if (intervalDays !== undefined) {
      const t = getTaskView(ctx.db, { ...base, now: new Date() });
      if (!t) return { ok: false, error: "Aufgabe nicht gefunden." };
      updateTask(ctx.db, {
        ...base,
        name: t.name,
        multiplier: t.multiplier,
        intervalDays,
      });
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    throw e;
  }
}

const lastDone = z.object({
  objectId: z.string().min(1),
  lastDone: z.enum(["today", "some_days", "unknown"]),
});

export async function setLastDoneAction(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireHousehold();
  const parsed = lastDone.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Anfrage." };
  try {
    setObjectLastDone(ctx.db, {
      householdId: ctx.household.id,
      viewerId: ctx.user.id,
      ...parsed.data,
      now: new Date(),
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    throw e;
  }
}
