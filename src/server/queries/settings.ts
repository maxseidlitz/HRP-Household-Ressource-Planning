import { and, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { featureVote, household, user } from "@/db/schema";
import { featureVoteState } from "@/domain/objection";
import {
  householdSettingsSchema,
  parseSettings,
  type HouseholdSettings,
} from "@/domain/settings";
import { assert } from "../errors";
import { getMembership, memberIds, requireAdminMembership } from "./members";
import { notify, notifyHousehold } from "./notifications";

const FEATURE = "objections";

function readSettings(db: DB, householdId: string): HouseholdSettings {
  const h = db
    .select({ settingsJson: household.settingsJson })
    .from(household)
    .where(eq(household.id, householdId))
    .get();
  assert(h, "WG nicht gefunden.");
  return parseSettings(h.settingsJson);
}

function writeSettings(db: DB, householdId: string, s: HouseholdSettings) {
  db.update(household)
    .set({ settingsJson: JSON.stringify(householdSettingsSchema.parse(s)) })
    .where(eq(household.id, householdId))
    .run();
}

/** Schwellen und Kalender-Erinnerung (Spez. 9.3). */
export function updateThresholds(
  db: DB,
  input: {
    householdId: string;
    actorId: string;
    earlyThreshold: number;
    lateThreshold: number;
    minProgress: number;
    icsAlarmMinutes: number;
  },
) {
  requireAdminMembership(
    db,
    input.householdId,
    input.actorId,
    "Nur Admins dürfen das ändern.",
  );
  const { earlyThreshold, lateThreshold, minProgress, icsAlarmMinutes } = input;
  assert(
    earlyThreshold > 0 && earlyThreshold < 1,
    "Der Sweet Spot muss zwischen 1 und 99 % beginnen.",
  );
  assert(
    lateThreshold >= 1 && lateThreshold <= 3,
    "Überfällig ab 100 bis 300 %.",
  );
  assert(
    minProgress >= 0 && minProgress <= earlyThreshold,
    "Der Mindestfortschritt darf nicht über dem Sweet-Spot-Beginn liegen.",
  );
  assert(
    Number.isInteger(icsAlarmMinutes) &&
      icsAlarmMinutes >= 0 &&
      icsAlarmMinutes <= 7 * 24 * 60,
    "Erinnerung: 0 Minuten bis 7 Tage vorher.",
  );
  writeSettings(db, input.householdId, {
    ...readSettings(db, input.householdId),
    earlyThreshold,
    lateThreshold,
    minProgress,
    icsAlarmMinutes,
  });
}

/** Admin schaltet die Widerspruchsfunktion allein ein oder aus (Spez. 6.3). */
export function setObjectionsEnabled(
  db: DB,
  input: { householdId: string; actorId: string; enabled: boolean },
) {
  requireAdminMembership(
    db,
    input.householdId,
    input.actorId,
    "Nur Admins dürfen das ändern.",
  );
  const s = readSettings(db, input.householdId);
  if (s.objectionsEnabled === input.enabled) return;
  db.transaction((tx) => {
    writeSettings(tx, input.householdId, {
      ...s,
      objectionsEnabled: input.enabled,
      objectionsEnabledBy: input.enabled ? "admin" : null,
    });
    if (input.enabled) {
      const actor = tx
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, input.actorId))
        .get();
      notifyHousehold(tx, {
        householdId: input.householdId,
        exceptUserId: input.actorId,
        type: "objections_enabled",
        payload: { by: "admin", userName: actor?.name },
        dedupePrefix: `objections-on:${crypto.randomUUID()}`,
      });
    }
  });
}

export function objectionVoteState(
  db: DB,
  input: { householdId: string; viewerId: string },
) {
  const h = db
    .select()
    .from(household)
    .where(eq(household.id, input.householdId))
    .get();
  assert(h, "WG nicht gefunden.");
  const settings = parseSettings(h.settingsJson);
  const members = memberIds(db, input.householdId);
  const votes = new Map(
    db
      .select({ userId: featureVote.userId, vote: featureVote.vote })
      .from(featureVote)
      .where(
        and(
          eq(featureVote.householdId, input.householdId),
          eq(featureVote.feature, FEATURE),
        ),
      )
      .all()
      .map((v) => [v.userId, v.vote]),
  );
  return {
    ...featureVoteState({
      memberIds: members,
      votes,
      expectedMemberCount: h.expectedMemberCount,
    }),
    enabled: settings.objectionsEnabled,
    enabledBy: settings.objectionsEnabledBy,
    myVote: votes.get(input.viewerId) ?? null,
  };
}

/**
 * Stimme zur Aktivierung. Stimmen alle zu, ist die Funktion an und alle
 * bekommen eine Mitteilung.
 */
export function castFeatureVote(
  db: DB,
  input: { householdId: string; userId: string; vote: boolean },
) {
  assert(
    getMembership(db, input.householdId, input.userId),
    "Du bist kein Mitglied dieser WG.",
  );
  return db.transaction((tx) => {
    tx.insert(featureVote)
      .values({
        householdId: input.householdId,
        feature: FEATURE,
        userId: input.userId,
        vote: input.vote,
      })
      .onConflictDoUpdate({
        target: [
          featureVote.householdId,
          featureVote.feature,
          featureVote.userId,
        ],
        set: { vote: input.vote },
      })
      .run();
    const state = objectionVoteState(tx, {
      householdId: input.householdId,
      viewerId: input.userId,
    });
    if (state.accepted && !state.enabled) {
      writeSettings(tx, input.householdId, {
        ...readSettings(tx, input.householdId),
        objectionsEnabled: true,
        objectionsEnabledBy: "vote",
      });
      for (const userId of memberIds(tx, input.householdId))
        notify(tx, {
          userId,
          householdId: input.householdId,
          type: "objections_enabled",
          payload: { by: "vote" },
        });
    }
    return objectionVoteState(tx, {
      householdId: input.householdId,
      viewerId: input.userId,
    });
  });
}

/**
 * Sind alle erwarteten Mitglieder da, bekommt jede:r einmal die Frage nach
 * der Widerspruchsfunktion (Spez. 6.3).
 */
export function requestFeatureVoteIfReady(db: DB, householdId: string) {
  const state = objectionVoteState(db, { householdId, viewerId: "" });
  if (!state.open || state.enabled) return;
  for (const userId of memberIds(db, householdId))
    notify(db, {
      userId,
      householdId,
      type: "feature_vote_request",
      payload: { feature: "objections" },
      dedupeKey: `featurevote:${householdId}:${userId}`,
    });
}
