"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ROOM_TYPES } from "@/db/schema";
import { DomainError } from "../errors";
import { requireHousehold } from "../context";
import {
  addObject,
  addTasks,
  assignRoom,
  createRoom,
  deleteObject,
  deleteRoom,
  deleteTask,
  setTaskActive,
  updateTask,
  type NewTask,
} from "../queries/rooms";
import { handle, num, str, type FormState } from "./result";

const newTaskSchema = z.object({
  name: z.string().trim().min(1),
  intervalDays: z.number(),
  multiplier: z.number(),
  lastDone: z.enum(["today", "some_days", "unknown"]),
});

/** Liest Aufgaben aus dem Formular: task.<i>.name, task.<i>.selected, … */
function parseTasks(form: FormData): NewTask[] {
  const indices = new Set<string>();
  for (const key of form.keys()) {
    const m = /^task\.(\d+)\./.exec(key);
    if (m) indices.add(m[1]);
  }
  const tasks: NewTask[] = [];
  for (const i of indices) {
    if (form.get(`task.${i}.selected`) !== "on") continue;
    const parsed = newTaskSchema.safeParse({
      name: str(form, `task.${i}.name`),
      intervalDays: num(form, `task.${i}.intervalDays`),
      multiplier: num(form, `task.${i}.multiplier`),
      lastDone: str(form, `task.${i}.lastDone`) || "unknown",
    });
    if (!parsed.success)
      throw new DomainError("Bitte alle Felder der Aufgabe ausfüllen.");
    tasks.push(parsed.data);
  }
  return tasks;
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function createRoomAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireHousehold();
  const result = await handle(() => {
    const type = z.enum(ROOM_TYPES).safeParse(str(form, "type"));
    if (!type.success) throw new DomainError("Bitte einen Raumtyp wählen.");
    const name = str(form, "name");
    if (name.length < 1 || name.length > 40)
      throw new DomainError("Der Raumname braucht 1 bis 40 Zeichen.");
    return createRoom(ctx.db, {
      householdId: ctx.household.id,
      actorId: ctx.user.id,
      type: type.data,
      name,
      privateOwnerId: str(form, "privateOwnerId") || null,
    }).id;
  });
  if (result?.ok) {
    refresh();
    redirect(`/raum/${result.data}`);
  }
  return result;
}

export async function assignRoomAction(form: FormData) {
  const ctx = await requireHousehold();
  assignRoom(ctx.db, {
    householdId: ctx.household.id,
    actorId: ctx.user.id,
    roomId: str(form, "roomId"),
    privateOwnerId: str(form, "privateOwnerId") || null,
  });
  refresh();
}

export async function deleteRoomAction(form: FormData) {
  const ctx = await requireHousehold();
  deleteRoom(ctx.db, {
    householdId: ctx.household.id,
    actorId: ctx.user.id,
    roomId: str(form, "roomId"),
  });
  refresh();
  redirect("/verwaltung/wohnung");
}

export async function addObjectAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireHousehold();
  const result = await handle(() => {
    const tasks = parseTasks(form);
    const input = { householdId: ctx.household.id, viewerId: ctx.user.id };
    const o = addObject(ctx.db, {
      ...input,
      roomId: str(form, "roomId"),
      type: str(form, "type"),
      name: str(form, "name"),
    });
    addTasks(ctx.db, { ...input, objectId: o.id, tasks, now: new Date() });
  });
  if (result?.ok) refresh();
  return result;
}

export async function addTasksAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireHousehold();
  const result = await handle(() => {
    const tasks = parseTasks(form);
    if (tasks.length === 0)
      throw new DomainError("Bitte mindestens eine Aufgabe auswählen.");
    addTasks(ctx.db, {
      householdId: ctx.household.id,
      viewerId: ctx.user.id,
      objectId: str(form, "objectId"),
      tasks,
      now: new Date(),
    });
  });
  if (result?.ok) refresh();
  return result;
}

export async function deleteObjectAction(form: FormData) {
  const ctx = await requireHousehold();
  deleteObject(ctx.db, {
    householdId: ctx.household.id,
    viewerId: ctx.user.id,
    objectId: str(form, "objectId"),
  });
  refresh();
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
  const roomId = str(form, "roomId");
  deleteTask(ctx.db, {
    householdId: ctx.household.id,
    viewerId: ctx.user.id,
    taskId: str(form, "taskId"),
  });
  refresh();
  redirect(roomId ? `/raum/${roomId}` : "/aufgaben");
}
