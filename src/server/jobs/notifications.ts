import { and, eq, gt, inArray, lte } from "drizzle-orm";
import type { DB } from "@/db/client";
import { absence, commitment, household, task, user } from "@/db/schema";
import {
  formatDate,
  localDateKey,
  zonedParts,
  zonedStartOfNextDay,
} from "@/domain/time";
import { awayUserIds } from "../queries/absences";
import { memberIds } from "../queries/members";
import { notify, notifyHousehold } from "../queries/notifications";
import { getTaskView, listTaskViews } from "../queries/tasks";

/** Ab wann am Tag Erinnerungen und die Sammelmeldung kommen (Ortszeit). */
const MORNING_HOUR = 7;
const SUMMARY_HOUR = 9;

/**
 * Erzeugt die Mitteilungen der Mitteilungszentrale (Spez. 8). Läuft
 * regelmäßig im Scheduler; Dedupe-Schlüssel verhindern Wiederholungen.
 * Wer im Urlaub ist, bekommt keine Erinnerungen (Spez. 7).
 */
export function runNotificationJobs(db: DB, now: Date) {
  for (const h of db.select().from(household).all()) {
    const members = memberIds(db, h.id);
    if (members.length === 0) continue;
    const away = awayUserIds(db, members, now);
    const local = zonedParts(now, h.timezone);
    const today = localDateKey(now, h.timezone);

    commitmentJobs(db, {
      householdId: h.id,
      timezone: h.timezone,
      now,
      away,
      hour: local.hour,
    });

    // Tägliche Sammelmeldung an alle (nur Gemeinschaftsräume)
    if (local.hour >= SUMMARY_HOUR) {
      const overdue = listTaskViews(db, {
        householdId: h.id,
        viewerId: members[0],
        now,
      }).filter(
        (t) =>
          !t.isPrivate &&
          t.active &&
          (t.status === "overdue" || t.status === "filthy"),
      );
      if (overdue.length) {
        for (const userId of members) {
          if (away.has(userId)) continue;
          notify(db, {
            userId,
            householdId: h.id,
            type: "daily_summary",
            payload: {
              count: overdue.length,
              names: overdue.map((t) => t.name),
            },
            dedupeKey: `summary:${h.id}:${userId}:${today}`,
          });
        }
      }
    }

    // Urlaub beginnt
    const started = db
      .select({ absence, name: user.name })
      .from(absence)
      .innerJoin(user, eq(user.id, absence.userId))
      .where(
        and(
          inArray(absence.userId, members),
          lte(absence.from, now),
          gt(absence.to, now),
        ),
      )
      .all();
    for (const s of started) {
      notifyHousehold(db, {
        householdId: h.id,
        exceptUserId: s.absence.userId,
        type: "absence_started",
        payload: {
          userName: s.name,
          until: formatDate(
            new Date(s.absence.to.getTime() - 60_000),
            h.timezone,
          ),
        },
        dedupePrefix: `absence:${s.absence.id}:${h.id}`,
      });
    }
  }
}

function commitmentJobs(
  db: DB,
  input: {
    householdId: string;
    timezone: string;
    now: Date;
    away: Set<string>;
    hour: number;
  },
) {
  const { now, timezone } = input;
  const open = db
    .select({ c: commitment })
    .from(commitment)
    .innerJoin(task, eq(task.id, commitment.taskId))
    .where(
      and(
        eq(task.householdId, input.householdId),
        eq(commitment.status, "open"),
      ),
    )
    .all()
    .map((r) => r.c);

  for (const c of open) {
    const view = getTaskView(db, {
      householdId: input.householdId,
      viewerId: c.userId,
      taskId: c.taskId,
      now,
    });
    if (!view) continue;
    const isAway = input.away.has(c.userId);
    const payload = {
      taskId: view.id,
      taskName: view.name,
      plannedFor: c.plannedFor.toISOString(),
    };

    // Verpasst: der geplante Tag ist vorbei (Spez. 5.6)
    if (now >= zonedStartOfNextDay(c.plannedFor, timezone)) {
      db.update(commitment)
        .set({ status: "missed" })
        .where(eq(commitment.id, c.id))
        .run();
      if (!isAway) {
        notify(db, {
          userId: c.userId,
          householdId: input.householdId,
          type: "commitment_missed",
          payload,
          dedupeKey: `missed:${c.id}`,
        });
      }
      continue;
    }
    if (isAway) continue;

    // Heute fällig
    if (
      localDateKey(c.plannedFor, timezone) === localDateKey(now, timezone) &&
      input.hour >= MORNING_HOUR
    ) {
      notify(db, {
        userId: c.userId,
        householdId: input.householdId,
        type: "commitment_due",
        payload,
        dedupeKey: `due:${c.id}`,
      });
    }

    // Überfällig: an die Person, die eingeplant hat (Spez. 8)
    if (
      view.active &&
      (view.status === "overdue" || view.status === "filthy")
    ) {
      notify(db, {
        userId: c.userId,
        householdId: input.householdId,
        type: "task_overdue",
        payload: { taskId: view.id, taskName: view.name },
        dedupeKey: `overdue:${view.id}:${view.dueAt.getTime()}:${c.userId}`,
      });
    }
  }
}
