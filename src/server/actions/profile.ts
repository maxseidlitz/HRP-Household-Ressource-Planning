"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { avatarSchema } from "@/catalog/avatar";
import { getDb } from "@/db";
import { user } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { assert, DomainError } from "../errors";
import { requireUser } from "../context";
import { consumePasswordReset } from "../queries/password-reset";
import { handle, str, type FormState } from "./result";

export async function updateProfileAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { db, user: u } = await requireUser();
  const result = await handle(() => {
    const name = str(form, "name");
    assert(
      name.length >= 1 && name.length <= 40,
      "Der Name braucht 1 bis 40 Zeichen.",
    );
    let avatar;
    try {
      avatar = avatarSchema.parse(JSON.parse(str(form, "avatar")));
    } catch {
      throw new DomainError("Ungültiger Avatar.");
    }
    db.update(user)
      .set({ name, avatarJson: JSON.stringify(avatar), updatedAt: new Date() })
      .where(eq(user.id, u.id))
      .run();
  });
  if (result?.ok) revalidatePath("/", "layout");
  return result;
}

export async function resetPasswordAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await handle(async () => {
    const password = String(form.get("password") ?? "");
    assert(
      password.length >= 8,
      "Das Passwort muss mindestens 8 Zeichen haben.",
    );
    const ctx = await getAuth().$context;
    const passwordHash = await ctx.password.hash(password);
    consumePasswordReset(getDb(), {
      token: str(form, "token"),
      passwordHash,
      now: new Date(),
    });
  });
  if (result?.ok) redirect("/login?reset=1");
  return result;
}
