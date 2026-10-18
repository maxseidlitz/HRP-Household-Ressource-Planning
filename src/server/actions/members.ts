"use server";

import { revalidatePath } from "next/cache";
import { appOrigin, requireHousehold } from "../context";
import { removeMember, setRole } from "../queries/households";
import { createPasswordReset } from "../queries/password-reset";
import { handle, str, type FormState } from "./result";

export async function setRoleAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireHousehold();
  const result = await handle(() =>
    setRole(ctx.db, {
      householdId: ctx.household.id,
      actorId: ctx.user.id,
      targetId: str(form, "userId"),
      role: str(form, "role") === "admin" ? "admin" : "member",
    }),
  );
  if (result?.ok) revalidatePath("/", "layout");
  return result;
}

export async function removeMemberAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireHousehold();
  const result = await handle(() =>
    removeMember(ctx.db, {
      householdId: ctx.household.id,
      actorId: ctx.user.id,
      targetId: str(form, "userId"),
    }),
  );
  if (result?.ok) revalidatePath("/", "layout");
  return result;
}

export async function createPasswordResetAction(
  _prev: FormState<string>,
  form: FormData,
): Promise<FormState<string>> {
  const ctx = await requireHousehold();
  const origin = await appOrigin();
  return handle(() => {
    const token = createPasswordReset(ctx.db, {
      householdId: ctx.household.id,
      actorId: ctx.user.id,
      targetId: str(form, "userId"),
      now: new Date(),
    });
    return `${origin}/reset/${token}`;
  });
}
