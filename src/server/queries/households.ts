import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { household, membership, room, user } from "@/db/schema";
import { parseSettings } from "@/domain/settings";
import { assert } from "../errors";
import { getMembership, requireAdminMembership } from "./members";
import { clearRoomContents } from "./rooms";

export type Role = "admin" | "member";

export function createHousehold(
  db: DB,
  input: {
    userId: string;
    name: string;
    emoji?: string | null;
    expectedMemberCount: number;
  },
) {
  return db.transaction((tx) => {
    const [h] = tx
      .insert(household)
      .values({
        name: input.name,
        emoji: input.emoji || null,
        createdByUserId: input.userId,
        expectedMemberCount: input.expectedMemberCount,
      })
      .returning()
      .all();
    tx.insert(membership)
      .values({ householdId: h.id, userId: input.userId, role: "admin" })
      .run();
    tx.update(user)
      .set({ lastHouseholdId: h.id })
      .where(eq(user.id, input.userId))
      .run();
    return h;
  });
}

export function listHouseholdsOf(db: DB, userId: string) {
  return db
    .select({
      id: household.id,
      name: household.name,
      emoji: household.emoji,
      role: membership.role,
    })
    .from(membership)
    .innerJoin(household, eq(household.id, membership.householdId))
    .where(eq(membership.userId, userId))
    .orderBy(asc(membership.joinedAt))
    .all();
}

export function getHousehold(db: DB, householdId: string) {
  const h = db
    .select()
    .from(household)
    .where(eq(household.id, householdId))
    .get();
  return h ? { ...h, settings: parseSettings(h.settingsJson) } : undefined;
}

export function switchHousehold(db: DB, userId: string, householdId: string) {
  assert(
    getMembership(db, householdId, userId),
    "Du bist kein Mitglied dieser WG.",
  );
  db.update(user)
    .set({ lastHouseholdId: householdId })
    .where(eq(user.id, userId))
    .run();
}

export function listMembers(db: DB, householdId: string) {
  return db
    .select({
      userId: user.id,
      name: user.name,
      username: user.username,
      avatarJson: user.avatarJson,
      role: membership.role,
      joinedAt: membership.joinedAt,
    })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(eq(membership.householdId, householdId))
    .orderBy(asc(membership.joinedAt))
    .all();
}

/**
 * Rollen ändern (Spez. 2.1): Nur Admins dürfen das. Der Ersteller kann von
 * anderen weder herabgestuft noch entfernt werden. Es bleibt immer mindestens
 * ein Admin.
 */
export function setRole(
  db: DB,
  input: { householdId: string; actorId: string; targetId: string; role: Role },
) {
  const h = getHousehold(db, input.householdId);
  assert(h, "WG nicht gefunden.");
  requireAdminMembership(
    db,
    input.householdId,
    input.actorId,
    "Nur Admins dürfen Rollen ändern.",
  );
  const target = getMembership(db, input.householdId, input.targetId);
  assert(target, "Diese Person ist kein Mitglied.");
  if (
    input.targetId === h.createdByUserId &&
    input.actorId !== input.targetId
  ) {
    assert(
      input.role === "admin",
      "Die Person, die die WG erstellt hat, kann nur selbst ihre Admin-Rolle abgeben.",
    );
  }
  if (target.role === "admin" && input.role === "member") {
    assert(
      countAdmins(db, input.householdId) > 1,
      "Es muss mindestens ein Admin bleiben.",
    );
  }
  db.update(membership)
    .set({ role: input.role })
    .where(
      and(
        eq(membership.householdId, input.householdId),
        eq(membership.userId, input.targetId),
      ),
    )
    .run();
}

export function removeMember(
  db: DB,
  input: { householdId: string; actorId: string; targetId: string },
) {
  const h = getHousehold(db, input.householdId);
  assert(h, "WG nicht gefunden.");
  const self = input.actorId === input.targetId;
  const actor = getMembership(db, input.householdId, input.actorId);
  assert(
    self || actor?.role === "admin",
    "Nur Admins dürfen Mitglieder entfernen.",
  );
  assert(
    self || input.targetId !== h.createdByUserId,
    "Die Person, die die WG erstellt hat, kann nicht entfernt werden.",
  );
  const target = getMembership(db, input.householdId, input.targetId);
  assert(target, "Diese Person ist kein Mitglied.");
  if (target.role === "admin") {
    assert(
      countAdmins(db, input.householdId) > 1,
      "Es muss mindestens ein Admin bleiben.",
    );
  }
  db.transaction((tx) => {
    // Privates Zimmer: Inhalt löschen, leerer Umriss bleibt (Spez. 4.2).
    const owned = tx
      .select({ id: room.id })
      .from(room)
      .where(
        and(
          eq(room.householdId, input.householdId),
          eq(room.privateOwnerId, input.targetId),
        ),
      )
      .all();
    for (const r of owned) {
      tx.delete(room).where(eq(room.parentRoomId, r.id)).run();
    }
    tx.update(room)
      .set({ privateOwnerId: null })
      .where(
        and(
          eq(room.householdId, input.householdId),
          eq(room.privateOwnerId, input.targetId),
        ),
      )
      .run();
    for (const r of owned) {
      clearRoomContents(tx, r.id);
    }
    tx.delete(membership)
      .where(
        and(
          eq(membership.householdId, input.householdId),
          eq(membership.userId, input.targetId),
        ),
      )
      .run();
  });
}

function countAdmins(db: DB, householdId: string): number {
  return db
    .select()
    .from(membership)
    .where(
      and(
        eq(membership.householdId, householdId),
        eq(membership.role, "admin"),
      ),
    )
    .all().length;
}
