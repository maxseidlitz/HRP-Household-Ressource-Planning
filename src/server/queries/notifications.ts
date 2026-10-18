import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { membership, notification } from "@/db/schema";
import type {
  NotificationPayloads,
  NotificationType,
} from "@/domain/notifications";

type Tx = Pick<DB, "select" | "insert" | "update" | "delete">;

/**
 * Legt eine Mitteilung an. Mit dedupeKey entsteht sie höchstens einmal,
 * auch wenn der Scheduler mehrfach läuft (Spez. 8).
 */
export function notify<T extends NotificationType>(
  db: Tx,
  input: {
    userId: string;
    householdId: string | null;
    type: T;
    payload: NotificationPayloads[T];
    dedupeKey?: string;
  },
): boolean {
  const res = db
    .insert(notification)
    .values({
      userId: input.userId,
      householdId: input.householdId,
      type: input.type,
      payloadJson: JSON.stringify(input.payload),
      dedupeKey: input.dedupeKey ?? null,
    })
    .onConflictDoNothing({ target: notification.dedupeKey })
    .run();
  return res.changes > 0;
}

/** Mitteilung an alle anderen Mitglieder einer WG. */
export function notifyHousehold<T extends NotificationType>(
  db: Tx,
  input: {
    householdId: string;
    exceptUserId: string;
    type: T;
    payload: NotificationPayloads[T];
    dedupePrefix: string;
  },
) {
  const members = db
    .select({ userId: membership.userId })
    .from(membership)
    .where(
      and(
        eq(membership.householdId, input.householdId),
        ne(membership.userId, input.exceptUserId),
      ),
    )
    .all();
  for (const m of members) {
    notify(db, {
      userId: m.userId,
      householdId: input.householdId,
      type: input.type,
      payload: input.payload,
      dedupeKey: `${input.dedupePrefix}:${m.userId}`,
    });
  }
}

export function listNotifications(
  db: DB,
  input: { userId: string; householdId: string; limit?: number },
) {
  return db
    .select()
    .from(notification)
    .where(
      and(
        eq(notification.userId, input.userId),
        eq(notification.householdId, input.householdId),
      ),
    )
    .orderBy(desc(notification.createdAt))
    .limit(input.limit ?? 50)
    .all();
}

/** Badge der Glocke: aktuelle WG; Punkt am Profilbild für andere WGs (Spez. 2.2). */
export function unreadCounts(
  db: DB,
  input: { userId: string; householdId: string },
) {
  const rows = db
    .select({ householdId: notification.householdId, n: sql<number>`count(*)` })
    .from(notification)
    .where(
      and(eq(notification.userId, input.userId), isNull(notification.readAt)),
    )
    .groupBy(notification.householdId)
    .all();
  const current = rows.find((r) => r.householdId === input.householdId)?.n ?? 0;
  const other = rows
    .filter((r) => r.householdId !== input.householdId)
    .reduce((s, r) => s + r.n, 0);
  return { current, other };
}

export function markAllRead(
  db: DB,
  input: { userId: string; householdId: string; now: Date },
) {
  db.update(notification)
    .set({ readAt: input.now })
    .where(
      and(
        eq(notification.userId, input.userId),
        eq(notification.householdId, input.householdId),
        isNull(notification.readAt),
      ),
    )
    .run();
}
