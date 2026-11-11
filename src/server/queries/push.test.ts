import { describe, expect, it } from "vitest";
import { notification, pushSubscription } from "@/db/schema";
import { addUser, testDb } from "@/test/db";
import { DomainError } from "../errors";
import { dispatchPush, type PushMessage, type SendResult } from "../jobs/push";
import { createHousehold } from "./households";
import { notify } from "./notifications";
import { deleteSubscription, saveSubscription, subscriptionsOf } from "./push";

const NOW = new Date("2026-11-11T08:00:00Z");
const sub = (n: number) => ({
  endpoint: `https://push.example/${n}`,
  p256dh: `key${n}`,
  auth: `auth${n}`,
});

function setup() {
  const db = testDb();
  addUser(db, "max", "Max");
  addUser(db, "anna", "Anna");
  const h = createHousehold(db, {
    userId: "max",
    name: "Sonnenallee",
    emoji: "🌻",
    expectedMemberCount: 2,
  });
  return { db, h };
}

/** Sender, der Aufrufe mitschreibt und je Endpoint ein Ergebnis liefert. */
function fakeSender(results: Record<string, SendResult> = {}) {
  const calls: { endpoint: string; message: PushMessage }[] = [];
  const send = async (s: { endpoint: string }, message: PushMessage) => {
    calls.push({ endpoint: s.endpoint, message });
    return results[s.endpoint] ?? "ok";
  };
  return { calls, send };
}

function addNotification(
  db: ReturnType<typeof testDb>,
  hid: string,
  userId: string,
  createdAt = NOW,
) {
  notify(db, {
    userId,
    householdId: hid,
    type: "member_joined",
    payload: { userName: "Ben" },
  });
  // created_at für den Test festlegen
  db.update(notification).set({ createdAt }).run();
}

describe("Web Push (Phase 5)", () => {
  it("speichert Abos je Gerät und übergibt sie bei neuer Anmeldung", () => {
    const { db } = setup();
    saveSubscription(db, { userId: "max", ...sub(1) });
    saveSubscription(db, { userId: "max", ...sub(2) });
    expect(subscriptionsOf(db, "max")).toHaveLength(2);
    // Anna meldet sich auf Gerät 2 an
    saveSubscription(db, { userId: "anna", ...sub(2) });
    expect(subscriptionsOf(db, "max")).toHaveLength(1);
    expect(subscriptionsOf(db, "anna")).toHaveLength(1);
    // Fremde Abos lassen sich nicht löschen
    deleteSubscription(db, { userId: "max", endpoint: sub(2).endpoint });
    expect(subscriptionsOf(db, "anna")).toHaveLength(1);
    expect(() =>
      saveSubscription(db, { userId: "max", ...sub(3), endpoint: "http://x" }),
    ).toThrow(DomainError);
  });

  it("stellt neue Mitteilungen einmal an alle Geräte zu", async () => {
    const { db, h } = setup();
    saveSubscription(db, { userId: "max", ...sub(1) });
    saveSubscription(db, { userId: "max", ...sub(2) });
    addNotification(db, h.id, "max");
    const { calls, send } = fakeSender();
    expect(await dispatchPush(db, send, NOW)).toEqual({ sent: 2, skipped: 0 });
    expect(calls[0].message).toEqual({
      title: "🌻 Sonnenallee",
      body: "👋 Ben ist der WG beigetreten.",
      url: "/rangliste",
      tag: expect.any(String),
    });
    expect(await dispatchPush(db, send, NOW)).toEqual({ sent: 0, skipped: 0 });
  });

  it("überspringt Personen ohne Abo und zu alte Mitteilungen", async () => {
    const { db, h } = setup();
    addNotification(db, h.id, "anna");
    const { calls, send } = fakeSender();
    expect(await dispatchPush(db, send, NOW)).toEqual({ sent: 0, skipped: 1 });

    saveSubscription(db, { userId: "max", ...sub(1) });
    addNotification(db, h.id, "max", new Date(NOW.getTime() - 25 * 3_600_000));
    await dispatchPush(db, send, NOW);
    expect(calls).toHaveLength(0);
  });

  it("löscht abgelaufene Abos und versucht es bei Fehlern kurz erneut", async () => {
    const { db, h } = setup();
    saveSubscription(db, { userId: "max", ...sub(1) });
    saveSubscription(db, { userId: "max", ...sub(2) });
    addNotification(db, h.id, "max");
    const { calls, send } = fakeSender({
      [sub(1).endpoint]: "gone",
      [sub(2).endpoint]: "error",
    });
    await dispatchPush(db, send, NOW);
    expect(db.select().from(pushSubscription).all()).toHaveLength(1);
    // Fehler: nach 1 Minute noch einmal, nach 11 Minuten nicht mehr
    await dispatchPush(db, send, new Date(NOW.getTime() + 60_000));
    await dispatchPush(db, send, new Date(NOW.getTime() + 11 * 60_000));
    await dispatchPush(db, send, new Date(NOW.getTime() + 12 * 60_000));
    expect(calls.map((c) => c.endpoint)).toEqual([
      sub(1).endpoint,
      sub(2).endpoint,
      sub(2).endpoint,
      sub(2).endpoint,
    ]);
  });
});
