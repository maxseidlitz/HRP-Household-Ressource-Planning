import { and, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { pushSubscription } from "@/db/schema";
import { assert } from "../errors";

export type PushKeys = { endpoint: string; p256dh: string; auth: string };

/**
 * Speichert das Push-Abo eines Geräts. Meldet sich auf dem Gerät jemand
 * anderes an, wandert das Abo zu dieser Person.
 */
export function saveSubscription(
  db: DB,
  input: PushKeys & { userId: string; userAgent?: string | null },
) {
  assert(
    /^https:\/\//.test(input.endpoint) && input.endpoint.length < 1000,
    "Ungültiges Push-Abo.",
  );
  assert(input.p256dh && input.auth, "Ungültiges Push-Abo.");
  const values = {
    userId: input.userId,
    p256dh: input.p256dh,
    auth: input.auth,
    userAgent: input.userAgent?.slice(0, 300) ?? null,
  };
  db.insert(pushSubscription)
    .values({ endpoint: input.endpoint, ...values })
    .onConflictDoUpdate({ target: pushSubscription.endpoint, set: values })
    .run();
}

export function deleteSubscription(
  db: DB,
  input: { userId: string; endpoint: string },
) {
  db.delete(pushSubscription)
    .where(
      and(
        eq(pushSubscription.endpoint, input.endpoint),
        eq(pushSubscription.userId, input.userId),
      ),
    )
    .run();
}

export function subscriptionsOf(db: DB, userId: string) {
  return db
    .select()
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId))
    .all();
}
