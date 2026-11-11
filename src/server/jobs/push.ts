import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import type { DB } from "@/db/client";
import { household, notification, pushSubscription } from "@/db/schema";
import { describeNotification } from "@/domain/notifications";
import type { PushKeys } from "../queries/push";

export type PushMessage = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

/** Ergebnis eines Zustellversuchs an ein Gerät. */
export type SendResult = "ok" | "gone" | "error";
export type PushSender = (
  sub: PushKeys,
  message: PushMessage,
) => Promise<SendResult>;

/** Ältere Mitteilungen werden nicht mehr gepusht. */
const MAX_AGE_MS = 24 * 3_600_000;
/** So lange wird bei vorübergehenden Fehlern erneut versucht. */
const RETRY_MS = 10 * 60_000;
const BATCH = 50;

/**
 * Stellt neue Mitteilungen per Web Push zu (Spez. 8 v2). Die Mitteilungen
 * selbst entstehen wie bisher; dieser Job liest sie aus der Tabelle, sendet
 * sie an alle Geräte der Person und merkt sich das in `pushed_at`.
 * Abgelaufene Abos (404/410) werden gelöscht.
 */
export async function dispatchPush(
  db: DB,
  send: PushSender,
  now: Date,
): Promise<{ sent: number; skipped: number }> {
  const cutoff = new Date(now.getTime() - MAX_AGE_MS);
  // Zu alt: nicht mehr zustellen
  db.update(notification)
    .set({ pushedAt: now })
    .where(
      and(isNull(notification.pushedAt), lt(notification.createdAt, cutoff)),
    )
    .run();

  const pending = db
    .select({
      n: notification,
      householdName: household.name,
      emoji: household.emoji,
    })
    .from(notification)
    .leftJoin(household, eq(household.id, notification.householdId))
    .where(
      and(isNull(notification.pushedAt), gte(notification.createdAt, cutoff)),
    )
    .limit(BATCH)
    .all();
  if (pending.length === 0) return { sent: 0, skipped: 0 };

  const userIds = [...new Set(pending.map((p) => p.n.userId))];
  const subs = db
    .select()
    .from(pushSubscription)
    .where(inArray(pushSubscription.userId, userIds))
    .all();

  let sent = 0;
  let skipped = 0;
  for (const { n, householdName, emoji } of pending) {
    const mine = subs.filter((s) => s.userId === n.userId);
    let retry = false;
    if (mine.length === 0) {
      skipped++;
    } else {
      const v = describeNotification(n.type, n.payloadJson);
      const message: PushMessage = {
        title: householdName
          ? `${emoji ? `${emoji} ` : ""}${householdName}`
          : "WG-App",
        body: `${v.icon} ${v.text}`,
        url: v.href ?? "/mitteilungen",
        tag: n.id,
      };
      for (const s of mine) {
        const result = await send(s, message);
        if (result === "ok") sent++;
        else if (result === "gone")
          db.delete(pushSubscription)
            .where(eq(pushSubscription.id, s.id))
            .run();
        else retry = true;
      }
    }
    const young = now.getTime() - n.createdAt.getTime() < RETRY_MS;
    if (!(retry && young))
      db.update(notification)
        .set({ pushedAt: now })
        .where(eq(notification.id, n.id))
        .run();
  }
  return { sent, skipped };
}
