import { and, eq, gte, isNull, max, ne } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  analyticsEvent,
  completion,
  householdObject,
  room,
  task,
} from "@/db/schema";
import {
  activePerDay,
  countBy,
  countSessions,
  rangeStart,
} from "@/domain/stats";
import { listMembers } from "./households";
import { listTaskViews } from "./tasks";

export const STAT_RANGES = [7, 30, 90] as const;
export type StatRange = (typeof STAT_RANGES)[number];

/**
 * Admin-Dashboard (Spez. 9.1). Private Zimmer sind ausgenommen: ihre
 * Erledigungen werden nicht als Events erfasst und hier herausgefiltert.
 */
export function householdStats(
  db: DB,
  input: {
    householdId: string;
    viewerId: string;
    days: StatRange;
    now: Date;
    timeZone: string;
  },
) {
  const since = rangeStart(input.now, input.days, input.timeZone);
  const events = db
    .select()
    .from(analyticsEvent)
    .where(
      and(
        eq(analyticsEvent.householdId, input.householdId),
        gte(analyticsEvent.createdAt, since),
      ),
    )
    .all();

  const members = listMembers(db, input.householdId);
  const lastSeen = new Map(
    db
      .select({
        userId: analyticsEvent.userId,
        at: max(analyticsEvent.createdAt),
      })
      .from(analyticsEvent)
      .where(eq(analyticsEvent.householdId, input.householdId))
      .groupBy(analyticsEvent.userId)
      .all()
      .map((r) => [r.userId, r.at]),
  );
  const perUser = members
    .map((m) => {
      const mine = events.filter((e) => e.userId === m.userId);
      return {
        userId: m.userId,
        name: m.name,
        avatarJson: m.avatarJson,
        events: mine.length,
        sessions: countSessions(mine.map((e) => e.createdAt)),
        lastSeen: lastSeen.get(m.userId) ?? null,
      };
    })
    .sort((a, b) => b.sessions - a.sessions || b.events - a.events);

  const weekAgo = new Date(input.now.getTime() - 7 * 86_400_000);
  const weeklyActive = new Set(
    events.filter((e) => e.createdAt >= weekAgo).map((e) => e.userId),
  );
  weeklyActive.delete(null);

  // Aufgaben-Kennzahlen nur für Gemeinschaftsräume
  const done = db
    .select({
      taskId: completion.taskId,
      progress: completion.progressAtCompletion,
    })
    .from(completion)
    .innerJoin(task, eq(task.id, completion.taskId))
    .innerJoin(householdObject, eq(householdObject.id, task.objectId))
    .innerJoin(room, eq(room.id, householdObject.roomId))
    .where(
      and(
        eq(task.householdId, input.householdId),
        isNull(room.privateOwnerId),
        eq(completion.source, "manual"),
        ne(completion.status, "revoked"),
        gte(completion.completedAt, since),
      ),
    )
    .all();
  const shared = listTaskViews(db, {
    householdId: input.householdId,
    viewerId: input.viewerId,
    now: input.now,
  }).filter((t) => !t.isPrivate && t.active);
  const perTask = shared
    .map((t) => ({
      taskId: t.id,
      name: t.name,
      roomName: t.roomName,
      count: done.filter((d) => d.taskId === t.id).length,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    since,
    activePerDay: activePerDay(events, input.now, input.days, input.timeZone),
    activeUsers: new Set(events.map((e) => e.userId).filter(Boolean)).size,
    weeklyActive: weeklyActive.size,
    members: members.length,
    perUser,
    screens: countBy(
      events.filter((e) => e.name === "screen_view"),
      (e) => e.screen,
    ),
    actions: countBy(
      events.filter((e) => e.name !== "screen_view"),
      (e) => e.name,
    ),
    tasks: {
      completions: done.length,
      avgProgress: done.length
        ? done.reduce((s, d) => s + d.progress, 0) / done.length
        : null,
      overdueShare: shared.length
        ? shared.filter((t) => t.status === "overdue" || t.status === "filthy")
            .length / shared.length
        : null,
      most: perTask.slice(0, 3),
      least: perTask.length > 3 ? perTask.slice(-3).reverse() : [],
    },
  };
}
