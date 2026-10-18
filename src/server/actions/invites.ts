"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHousehold, requireUser } from "../context";
import { track } from "../queries/analytics";
import { acceptInvite, createInvite, revokeInvite } from "../queries/invites";
import { handle, num, str, type FormState } from "./result";

export async function createInviteAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireHousehold();
  return handle(() => {
    createInvite(ctx.db, {
      householdId: ctx.household.id,
      actorId: ctx.user.id,
      validDays: Math.round(num(form, "validDays", 7)),
      singleUse: form.get("singleUse") === "on",
      now: new Date(),
    });
    track(ctx.db, {
      name: "invite_created",
      householdId: ctx.household.id,
      userId: ctx.user.id,
    });
    revalidatePath("/verwaltung/einladungen");
  });
}

export async function revokeInviteAction(form: FormData) {
  const ctx = await requireHousehold();
  revokeInvite(ctx.db, {
    householdId: ctx.household.id,
    actorId: ctx.user.id,
    inviteId: str(form, "inviteId"),
    now: new Date(),
  });
  revalidatePath("/verwaltung/einladungen");
}

export async function acceptInviteAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { db, user } = await requireUser();
  const result = await handle(() => {
    const r = acceptInvite(db, {
      token: str(form, "token"),
      userId: user.id,
      now: new Date(),
    });
    if (r.joined) {
      track(db, {
        name: "invite_accepted",
        householdId: r.householdId,
        userId: user.id,
      });
    }
  });
  if (result?.ok) {
    revalidatePath("/", "layout");
    redirect("/aufgaben?willkommen=1");
  }
  return result;
}
