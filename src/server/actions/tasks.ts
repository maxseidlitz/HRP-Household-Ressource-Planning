"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "../errors";
import { requireHousehold } from "../context";
import { track } from "../queries/analytics";
import { completeTask, type CompleteResult } from "../queries/tasks";

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
