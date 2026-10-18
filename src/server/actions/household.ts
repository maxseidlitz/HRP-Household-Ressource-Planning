"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assert } from "../errors";
import { requireHousehold, requireUser } from "../context";
import {
  createHousehold,
  removeMember,
  switchHousehold,
} from "../queries/households";
import { track } from "../queries/analytics";
import { getDb } from "@/db";
import { household } from "@/db/schema";
import { eq } from "drizzle-orm";
import { handle, num, str, type FormState } from "./result";

export async function createHouseholdAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { db, user } = await requireUser();
  const result = await handle(() => {
    const name = str(form, "name");
    assert(
      name.length >= 2 && name.length <= 60,
      "Der WG-Name braucht 2 bis 60 Zeichen.",
    );
    const expected = num(form, "expectedMemberCount", 2);
    assert(expected >= 1 && expected <= 30, "Erwartete Mitglieder: 1 bis 30.");
    const h = createHousehold(db, {
      userId: user.id,
      name,
      emoji: str(form, "emoji").slice(0, 8) || null,
      expectedMemberCount: Math.round(expected),
    });
    track(db, {
      name: "household_created",
      householdId: h.id,
      userId: user.id,
    });
    return h.id;
  });
  if (result?.ok) {
    revalidatePath("/", "layout");
    redirect("/verwaltung/wohnung?neu=1");
  }
  return result;
}

export async function switchHouseholdAction(form: FormData) {
  const { db, user } = await requireUser();
  switchHousehold(db, user.id, str(form, "householdId"));
  revalidatePath("/", "layout");
  redirect("/aufgaben");
}

export async function updateExpectedMembersAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireHousehold();
  return handle(() => {
    assert(ctx.isAdmin, "Nur Admins dürfen das ändern.");
    const n = Math.round(num(form, "expectedMemberCount"));
    assert(n >= 1 && n <= 30, "Erwartete Mitglieder: 1 bis 30.");
    getDb()
      .update(household)
      .set({ expectedMemberCount: n })
      .where(eq(household.id, ctx.household.id))
      .run();
    revalidatePath("/verwaltung", "layout");
  });
}

export async function leaveHouseholdAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { db, user } = await requireUser();
  const householdId = str(form, "householdId");
  const result = await handle(() =>
    removeMember(db, { householdId, actorId: user.id, targetId: user.id }),
  );
  if (result?.ok) {
    revalidatePath("/", "layout");
    redirect("/aufgaben");
  }
  return result;
}
