import { and, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { membership } from "@/db/schema";
import { assert } from "../errors";

/** Mitgliedschaft einer Person in einer WG (oder undefined). */
export function getMembership(db: DB, householdId: string, userId: string) {
  return db
    .select()
    .from(membership)
    .where(
      and(
        eq(membership.householdId, householdId),
        eq(membership.userId, userId),
      ),
    )
    .get();
}

/** Bricht mit `message` ab, wenn die Person kein Admin der WG ist. */
export function requireAdminMembership(
  db: DB,
  householdId: string,
  userId: string,
  message: string,
) {
  const m = getMembership(db, householdId, userId);
  assert(m?.role === "admin", message);
  return m;
}

/** IDs aller Mitglieder einer WG. */
export function memberIds(db: DB, householdId: string): string[] {
  return db
    .select({ userId: membership.userId })
    .from(membership)
    .where(eq(membership.householdId, householdId))
    .all()
    .map((m) => m.userId);
}
