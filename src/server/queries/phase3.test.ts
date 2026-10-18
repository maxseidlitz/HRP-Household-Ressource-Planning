import { describe, expect, it } from "vitest";
import { notification } from "@/db/schema";
import { DAY_MS } from "@/domain/progress";
import { addUser, testDb } from "@/test/db";
import { DomainError } from "../errors";
import { runNotificationJobs } from "../jobs/notifications";
import {
  bundlesFor,
  completeVacationItem,
  createAbsence,
  endAbsence,
  linkedTaskIds,
  setLinkedTasks,
} from "./absences";
import { cancelCommitment, createCommitment } from "./commitments";
import { createHousehold } from "./households";
import { acceptInvite, createInvite } from "./invites";
import { listNotifications, markAllRead, unreadCounts } from "./notifications";
import { addObject, addTasks, createRoom } from "./rooms";
import { completeTask, householdLeaderboard, listTaskViews } from "./tasks";

// Sonntag, 18.10.2026, 10:00 Uhr in Berlin
const NOW = new Date("2026-10-18T08:00:00Z");
const at = (days: number, hours = 0) =>
  new Date(NOW.getTime() + days * DAY_MS + hours * 3_600_000);

function setup() {
  const db = testDb();
  addUser(db, "max", "Max");
  addUser(db, "anna", "Anna");
  const h = createHousehold(db, {
    userId: "max",
    name: "WG",
    expectedMemberCount: 2,
  });
  const i = createInvite(db, {
    householdId: h.id,
    actorId: "max",
    validDays: 7,
    singleUse: true,
    now: NOW,
  });
  acceptInvite(db, { token: i.token, userId: "anna", now: NOW });
  const kitchen = createRoom(db, {
    householdId: h.id,
    actorId: "max",
    type: "kitchen",
    name: "Küche",
  });
  const base = { householdId: h.id, viewerId: "max", now: NOW };
  const trash = addObject(db, {
    ...base,
    roomId: kitchen.id,
    type: "trash_rest",
  });
  const stove = addObject(db, { ...base, roomId: kitchen.id, type: "stove" });
  const [muell] = addTasks(db, {
    ...base,
    objectId: trash.id,
    tasks: [
      {
        name: "Restmüll rausbringen",
        intervalDays: 3,
        multiplier: 0.5,
        lastDone: "today",
      },
    ],
  });
  const [herd] = addTasks(db, {
    ...base,
    objectId: stove.id,
    tasks: [
      {
        name: "Herd reinigen",
        intervalDays: 7,
        multiplier: 1,
        lastDone: "today",
      },
    ],
  });
  return { db, h, muell, herd };
}

const types = (db: ReturnType<typeof testDb>, userId: string) =>
  db
    .select()
    .from(notification)
    .all()
    .filter((n) => n.userId === userId)
    .map((n) => n.type)
    .sort();

describe("Einplanen (Spez. 5.6)", () => {
  it("erlaubt pro Aufgabe nur eine offene Einplanung", () => {
    const { db, h, herd } = setup();
    const c = createCommitment(db, {
      householdId: h.id,
      userId: "anna",
      taskId: herd.id,
      plannedFor: at(2),
      now: NOW,
    });
    expect(() =>
      createCommitment(db, {
        householdId: h.id,
        userId: "max",
        taskId: herd.id,
        plannedFor: at(3),
        now: NOW,
      }),
    ).toThrow(/Anna hat diese Aufgabe schon eingeplant/);
    // Eigene Einplanung verschieben
    createCommitment(db, {
      householdId: h.id,
      userId: "anna",
      taskId: herd.id,
      plannedFor: at(4),
      now: NOW,
    });
    const view = listTaskViews(db, {
      householdId: h.id,
      viewerId: "max",
      now: NOW,
    }).find((t) => t.id === herd.id)!;
    expect(view.commitment).toMatchObject({
      userName: "Anna",
      plannedFor: at(4),
    });
    expect(() =>
      cancelCommitment(db, { userId: "max", commitmentId: c.id }),
    ).toThrow(DomainError);
  });

  it("wird durch Erledigen erfüllt, egal von wem", () => {
    const { db, h, herd } = setup();
    createCommitment(db, {
      householdId: h.id,
      userId: "anna",
      taskId: herd.id,
      plannedFor: at(2),
      now: NOW,
    });
    completeTask(db, {
      householdId: h.id,
      userId: "max",
      taskId: herd.id,
      idempotencyKey: "k",
      now: at(4),
    });
    expect(
      listTaskViews(db, { householdId: h.id, viewerId: "max", now: at(4) })[0]
        .commitment,
    ).toBeNull();
  });

  it("lehnt Zeitpunkte in der Vergangenheit ab", () => {
    const { db, h, herd } = setup();
    expect(() =>
      createCommitment(db, {
        householdId: h.id,
        userId: "anna",
        taskId: herd.id,
        plannedFor: at(-1),
        now: NOW,
      }),
    ).toThrow(/Zukunft/);
  });
});

describe("Mitteilungen (Spez. 8)", () => {
  it("meldet neue Mitglieder an die anderen", () => {
    const { db } = setup();
    expect(types(db, "max")).toEqual(["member_joined"]);
    expect(types(db, "anna")).toEqual([]);
  });

  it("erinnert am geplanten Tag und meldet verpasste Einplanungen einmal", () => {
    const { db, h, herd } = setup();
    // Dienstag 20.10., 18 Uhr
    createCommitment(db, {
      householdId: h.id,
      userId: "anna",
      taskId: herd.id,
      plannedFor: at(2, 8),
      now: NOW,
    });
    runNotificationJobs(db, at(1));
    expect(types(db, "anna")).toEqual([]);
    runNotificationJobs(db, at(2, -2)); // Dienstag, 8 Uhr
    runNotificationJobs(db, at(2, -1));
    expect(types(db, "anna")).toEqual(["commitment_due"]);
    runNotificationJobs(db, at(3)); // Mittwoch
    runNotificationJobs(db, at(3, 1));
    // Restmüll ist inzwischen überfällig → Sammelmeldung kommt zusätzlich.
    expect(types(db, "anna").filter((t) => t !== "daily_summary")).toEqual([
      "commitment_due",
      "commitment_missed",
    ]);
  });

  it("meldet Überfälliges an die Person, die eingeplant hat, plus Sammelmeldung an alle", () => {
    const { db, h, muell } = setup();
    createCommitment(db, {
      householdId: h.id,
      userId: "anna",
      taskId: muell.id,
      plannedFor: at(3, 8),
      now: NOW,
    });
    runNotificationJobs(db, at(3, 2)); // 12 Uhr, Restmüll seit 2 h überfällig
    expect(types(db, "anna")).toEqual([
      "commitment_due",
      "daily_summary",
      "task_overdue",
    ]);
    expect(types(db, "max")).toEqual(["daily_summary", "member_joined"]);
    runNotificationJobs(db, at(3, 3));
    expect(types(db, "max")).toEqual(["daily_summary", "member_joined"]); // keine Wiederholung
  });

  it("zählt Ungelesenes pro WG und markiert als gelesen", () => {
    const { db, h } = setup();
    expect(unreadCounts(db, { userId: "max", householdId: h.id })).toEqual({
      current: 1,
      other: 0,
    });
    expect(unreadCounts(db, { userId: "max", householdId: "andere" })).toEqual({
      current: 0,
      other: 1,
    });
    markAllRead(db, { userId: "max", householdId: h.id, now: NOW });
    expect(unreadCounts(db, { userId: "max", householdId: h.id }).current).toBe(
      0,
    );
    expect(
      listNotifications(db, { userId: "max", householdId: h.id }),
    ).toHaveLength(1);
  });
});

describe("Urlaub (Spez. 7)", () => {
  it("legt ein Paket an, setzt verknüpfte Aufgaben ohne Doppelpunkte zurück", () => {
    const { db, h, muell } = setup();
    const a = createAbsence(db, {
      userId: "anna",
      from: at(5),
      to: at(12),
      now: NOW,
    });
    const [b] = bundlesFor(db, { userId: "anna", householdId: h.id, now: NOW });
    expect(b.absence.id).toBe(a.id);
    expect(linkedTaskIds(db, h.id)).toEqual([muell.id]);

    const later = at(2);
    expect(
      completeVacationItem(db, {
        userId: "anna",
        householdId: h.id,
        bundleId: b.bundle.id,
        item: "fridge",
        now: later,
      }),
    ).toBe(1);
    expect(
      completeVacationItem(db, {
        userId: "anna",
        householdId: h.id,
        bundleId: b.bundle.id,
        item: "vacuumTrash",
        now: later,
      }),
    ).toBe(4);
    expect(() =>
      completeVacationItem(db, {
        userId: "anna",
        householdId: h.id,
        bundleId: b.bundle.id,
        item: "fridge",
        now: later,
      }),
    ).toThrow(/Schon erledigt/);

    const muellView = listTaskViews(db, {
      householdId: h.id,
      viewerId: "max",
      now: later,
    }).find((t) => t.id === muell.id)!;
    expect(muellView.progress).toBe(0);
    const board = householdLeaderboard(db, {
      householdId: h.id,
      period: "total",
      now: later,
    });
    expect(board.find((e) => e.userId === "anna")?.points).toBe(5);
  });

  it("verhindert Überschneidungen und beendet laufenden Urlaub", () => {
    const { db } = setup();
    const a = createAbsence(db, {
      userId: "anna",
      from: at(-1),
      to: at(5),
      now: NOW,
    });
    expect(() =>
      createAbsence(db, { userId: "anna", from: at(2), to: at(8), now: NOW }),
    ).toThrow(/schon Urlaub/);
    endAbsence(db, { userId: "anna", absenceId: a.id, now: NOW });
    createAbsence(db, { userId: "anna", from: at(2), to: at(8), now: NOW });
  });

  it("schickt Abwesenden keine Erinnerungen und meldet den Urlaubsbeginn", () => {
    const { db, h, muell } = setup();
    createAbsence(db, { userId: "anna", from: at(1), to: at(10), now: NOW });
    createCommitment(db, {
      householdId: h.id,
      userId: "anna",
      taskId: muell.id,
      plannedFor: at(3, 8),
      now: NOW,
    });
    runNotificationJobs(db, at(3, 2));
    expect(types(db, "anna")).toEqual([]);
    expect(types(db, "max")).toEqual([
      "absence_started",
      "daily_summary",
      "member_joined",
    ]);
  });

  it("lässt nur Admins das Paket einstellen", () => {
    const { db, h, herd } = setup();
    expect(() =>
      setLinkedTasks(db, {
        householdId: h.id,
        actorId: "anna",
        taskIds: [herd.id],
      }),
    ).toThrow(/Nur Admins/);
    setLinkedTasks(db, {
      householdId: h.id,
      actorId: "max",
      taskIds: [herd.id],
    });
    expect(linkedTaskIds(db, h.id)).toEqual([herd.id]);
  });
});
