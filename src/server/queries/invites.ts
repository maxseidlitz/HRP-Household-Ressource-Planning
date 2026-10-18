import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { household, invite, membership, user } from "@/db/schema";
import { assert, DomainError } from "../errors";
import { getMembership } from "./households";
import { notifyHousehold } from "./notifications";
import { requestFeatureVoteIfReady } from "./settings";

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function createInvite(
  db: DB,
  input: {
    householdId: string;
    actorId: string;
    validDays: number;
    singleUse: boolean;
    now: Date;
  },
) {
  const actor = getMembership(db, input.householdId, input.actorId);
  assert(actor?.role === "admin", "Nur Admins dürfen einladen.");
  assert(
    input.validDays >= 1 && input.validDays <= 90,
    "Gültigkeit: 1 bis 90 Tage.",
  );
  const [i] = db
    .insert(invite)
    .values({
      householdId: input.householdId,
      token: newToken(),
      createdByUserId: input.actorId,
      expiresAt: new Date(input.now.getTime() + input.validDays * 86_400_000),
      maxUses: input.singleUse ? 1 : null,
    })
    .returning()
    .all();
  return i;
}

export function listInvites(db: DB, householdId: string) {
  return db
    .select()
    .from(invite)
    .where(eq(invite.householdId, householdId))
    .orderBy(desc(invite.createdAt))
    .all();
}

export function revokeInvite(
  db: DB,
  input: { householdId: string; actorId: string; inviteId: string; now: Date },
) {
  const actor = getMembership(db, input.householdId, input.actorId);
  assert(actor?.role === "admin", "Nur Admins dürfen Einladungen widerrufen.");
  db.update(invite)
    .set({ revokedAt: input.now })
    .where(
      and(
        eq(invite.id, input.inviteId),
        eq(invite.householdId, input.householdId),
        isNull(invite.revokedAt),
      ),
    )
    .run();
}

export type InviteState = "valid" | "expired" | "revoked" | "used_up";

export function inviteState(
  i: Pick<
    typeof invite.$inferSelect,
    "revokedAt" | "expiresAt" | "maxUses" | "uses"
  >,
  now: Date,
): InviteState {
  if (i.revokedAt) return "revoked";
  if (i.expiresAt <= now) return "expired";
  if (i.maxUses !== null && i.uses >= i.maxUses) return "used_up";
  return "valid";
}

/** Öffentliche Infos zu einem Einladungslink (ohne Login abrufbar). */
export function lookupInvite(db: DB, token: string, now: Date) {
  const row = db
    .select({
      invite,
      householdName: household.name,
      householdEmoji: household.emoji,
      inviterName: user.name,
    })
    .from(invite)
    .innerJoin(household, eq(household.id, invite.householdId))
    .innerJoin(user, eq(user.id, invite.createdByUserId))
    .where(eq(invite.token, token))
    .get();
  if (!row) return null;
  return { ...row, state: inviteState(row.invite, now) };
}

const STATE_MESSAGES: Record<Exclude<InviteState, "valid">, string> = {
  expired: "Dieser Einladungslink ist abgelaufen.",
  revoked: "Dieser Einladungslink wurde widerrufen.",
  used_up: "Dieser Einladungslink wurde schon verwendet.",
};

/** Tritt der WG bei. Wer schon Mitglied ist, bleibt es (kein Fehler). */
export function acceptInvite(
  db: DB,
  input: { token: string; userId: string; now: Date },
) {
  return db.transaction((tx) => {
    const i = tx
      .select()
      .from(invite)
      .where(eq(invite.token, input.token))
      .get();
    if (!i) throw new DomainError("Diesen Einladungslink gibt es nicht.");
    const already = getMembership(
      tx as unknown as DB,
      i.householdId,
      input.userId,
    );
    if (!already) {
      const state = inviteState(i, input.now);
      if (state !== "valid") throw new DomainError(STATE_MESSAGES[state]);
      tx.insert(membership)
        .values({
          householdId: i.householdId,
          userId: input.userId,
          role: "member",
        })
        .run();
      tx.update(invite)
        .set({ uses: sql`${invite.uses} + 1` })
        .where(eq(invite.id, i.id))
        .run();
      const joined = tx
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, input.userId))
        .get();
      notifyHousehold(tx, {
        householdId: i.householdId,
        exceptUserId: input.userId,
        type: "member_joined",
        payload: { userName: joined?.name ?? "Jemand" },
        dedupePrefix: `joined:${i.householdId}:${input.userId}`,
      });
      requestFeatureVoteIfReady(tx as unknown as DB, i.householdId);
    }
    tx.update(user)
      .set({ lastHouseholdId: i.householdId })
      .where(eq(user.id, input.userId))
      .run();
    return { householdId: i.householdId, joined: !already };
  });
}
