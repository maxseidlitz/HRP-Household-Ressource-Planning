"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DomainError } from "../errors";
import { requireHousehold } from "../context";
import { track } from "../queries/analytics";
import { deleteTask, setTaskActive, updateTask } from "../queries/rooms";
import { completeTask, type CompleteResult } from "../queries/tasks";
import { handle, num, str, type FormState } from "./result";

export type CompleteActionResult =
  { ok: true; result: CompleteResult } | { ok: false; error: string };

export async function completeTaskAction(
  taskId: string,
  idempotencyKey: string,
): Promise<CompleteActionResult> {
  const ctx = await requireHousehold();
  try {
    const result = completeTask(ctx.db, {
      householdId: ctx.household.id,
      userId: ctx.user.id,
      taskId,
      idempotencyKey,
      now: new Date(),
    });
    // Private Zimmer fließen in keine Statistik ein (Spez. 4.2).
    if (!result.duplicate && !result.isPrivate) {
      track(ctx.db, {
        name: "task_completed",
        householdId: ctx.household.id,
        userId: ctx.user.id,
        meta: { taskId, progress: result.progress, points: result.points },
      });
    }
    revalidatePath("/", "layout");
    return { ok: true, result };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    throw e;
  }
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function updateTaskAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireHousehold();
  const result = await handle(() =>
    updateTask(ctx.db, {
      householdId: ctx.household.id,
      viewerId: ctx.user.id,
      taskId: str(form, "taskId"),
      name: str(form, "name"),
      intervalDays: num(form, "intervalDays"),
      multiplier: num(form, "multiplier"),
    }),
  );
  if (result?.ok) refresh();
  return result;
}

export async function setTaskActiveAction(form: FormData) {
  const ctx = await requireHousehold();
  setTaskActive(ctx.db, {
    householdId: ctx.household.id,
    viewerId: ctx.user.id,
    taskId: str(form, "taskId"),
    active: str(form, "active") === "true",
    now: new Date(),
  });
  refresh();
}

export async function deleteTaskAction(form: FormData) {
  const ctx = await requireHousehold();
  deleteTask(ctx.db, {
    householdId: ctx.household.id,
    viewerId: ctx.user.id,
    taskId: str(form, "taskId"),
  });
  refresh();
  redirect("/aufgaben");
}
