"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ROOM_TYPES } from "@/db/schema";
import { doorSchema, tileSchema } from "@/domain/grid";
import { DomainError } from "../errors";
import { requireHousehold } from "../context";
import {
  createGroup,
  deleteGroup,
  placeObject,
  saveRoomLayout,
} from "../queries/plan";
import { createSubroom } from "../queries/rooms";
import { handle, str, type FormState } from "./result";

const layoutSchema = z.object({
  roomId: z.string().min(1),
  tiles: z.array(tileSchema).max(1600),
  doors: z.array(doorSchema).max(400),
});

export async function saveRoomLayoutAction(input: unknown): Promise<FormState> {
  const ctx = await requireHousehold();
  const result = await handle(() => {
    const parsed = layoutSchema.safeParse(input);
    if (!parsed.success) throw new DomainError("Ungültiger Grundriss.");
    saveRoomLayout(ctx.db, {
      householdId: ctx.household.id,
      actorId: ctx.user.id,
      ...parsed.data,
    });
  });
  if (result?.ok) revalidatePath("/", "layout");
  return result;
}

const placeSchema = z.object({
  objectId: z.string().min(1),
  position: z
    .object({
      x: z.number().int().min(0).max(100),
      y: z.number().int().min(0).max(100),
      rotation: z.number().int(),
    })
    .nullable(),
});

export async function placeObjectAction(input: unknown): Promise<FormState> {
  const ctx = await requireHousehold();
  const result = await handle(() => {
    const parsed = placeSchema.safeParse(input);
    if (!parsed.success) throw new DomainError("Ungültige Position.");
    placeObject(ctx.db, {
      householdId: ctx.household.id,
      viewerId: ctx.user.id,
      ...parsed.data,
    });
  });
  if (result?.ok) revalidatePath("/", "layout");
  return result;
}

export async function createGroupAction(input: unknown): Promise<FormState> {
  const ctx = await requireHousehold();
  const result = await handle(() => {
    const parsed = z
      .object({
        roomId: z.string(),
        name: z.string(),
        objectIds: z.array(z.string()),
      })
      .safeParse(input);
    if (!parsed.success) throw new DomainError("Ungültige Gruppe.");
    createGroup(ctx.db, {
      householdId: ctx.household.id,
      viewerId: ctx.user.id,
      ...parsed.data,
    });
  });
  if (result?.ok) revalidatePath("/", "layout");
  return result;
}

export async function deleteGroupAction(groupId: string): Promise<FormState> {
  const ctx = await requireHousehold();
  const result = await handle(() =>
    deleteGroup(ctx.db, {
      householdId: ctx.household.id,
      viewerId: ctx.user.id,
      groupId,
    }),
  );
  if (result?.ok) revalidatePath("/", "layout");
  return result;
}

export async function createSubroomAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireHousehold();
  const result = await handle(() => {
    const type = z.enum(ROOM_TYPES).safeParse(str(form, "type"));
    if (!type.success) throw new DomainError("Bitte einen Raumtyp wählen.");
    const name = str(form, "name");
    if (name.length < 1 || name.length > 40)
      throw new DomainError("Der Name braucht 1 bis 40 Zeichen.");
    return createSubroom(ctx.db, {
      householdId: ctx.household.id,
      viewerId: ctx.user.id,
      parentRoomId: str(form, "parentRoomId"),
      type: type.data,
      name,
    }).id;
  });
  if (result?.ok) {
    revalidatePath("/", "layout");
    redirect(`/plan/bearbeiten?raum=${result.data}`);
  }
  return result;
}
