import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "@/db/client";
import { account, passwordReset, session, user } from "@/db/schema";
import { assert, DomainError } from "../errors";
import { getMembership } from "./households";
import { newToken } from "./invites";

const VALID_MS = 24 * 60 * 60 * 1000;

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/** Admin erzeugt einen einmaligen Reset-Link (Spez. 2.3). */
export function createPasswordReset(
  db: DB,
  input: { householdId: string; actorId: string; targetId: string; now: Date },
) {
  const actor = getMembership(db, input.householdId, input.actorId);
  assert(actor?.role === "admin", "Nur Admins dürfen Reset-Links erzeugen.");
  assert(
    getMembership(db, input.householdId, input.targetId),
    "Diese Person ist kein Mitglied.",
  );
  const token = newToken();
  db.insert(passwordReset)
    .values({
      householdId: input.householdId,
      userId: input.targetId,
      tokenHash: hashToken(token),
      createdByUserId: input.actorId,
      expiresAt: new Date(input.now.getTime() + VALID_MS),
    })
    .run();
  return token;
}

export function lookupPasswordReset(db: DB, token: string, now: Date) {
  const row = db
    .select({
      reset: passwordReset,
      userName: user.name,
      username: user.username,
    })
    .from(passwordReset)
    .innerJoin(user, eq(user.id, passwordReset.userId))
    .where(eq(passwordReset.tokenHash, hashToken(token)))
    .get();
  if (!row || row.reset.usedAt || row.reset.expiresAt <= now) return null;
  return row;
}

/**
 * Setzt das Passwort und meldet alle bestehenden Sitzungen ab. Das Hashing
 * übernimmt der Aufrufer mit dem Hasher von Better Auth.
 */
export function consumePasswordReset(
  db: DB,
  input: { token: string; passwordHash: string; now: Date },
) {
  db.transaction((tx) => {
    const r = tx
      .select()
      .from(passwordReset)
      .where(
        and(
          eq(passwordReset.tokenHash, hashToken(input.token)),
          isNull(passwordReset.usedAt),
        ),
      )
      .get();
    if (!r || r.expiresAt <= input.now) {
      throw new DomainError("Dieser Link ist ungültig oder abgelaufen.");
    }
    const updated = tx
      .update(account)
      .set({ password: input.passwordHash, updatedAt: input.now })
      .where(
        and(eq(account.userId, r.userId), eq(account.providerId, "credential")),
      )
      .returning({ id: account.id })
      .all();
    assert(
      updated.length === 1,
      "Für diesen Account ist kein Passwort-Login hinterlegt.",
    );
    tx.update(passwordReset)
      .set({ usedAt: input.now })
      .where(eq(passwordReset.id, r.id))
      .run();
    tx.delete(session).where(eq(session.userId, r.userId)).run();
  });
}
