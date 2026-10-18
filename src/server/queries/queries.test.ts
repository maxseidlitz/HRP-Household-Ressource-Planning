import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { account, session } from "@/db/schema";
import { DAY_MS } from "@/domain/progress";
import { addUser, testDb } from "@/test/db";
import { DomainError } from "../errors";
import {
  createHousehold,
  listHouseholdsOf,
  listMembers,
  removeMember,
  setRole,
} from "./households";
import { acceptInvite, createInvite, revokeInvite } from "./invites";
import {
  consumePasswordReset,
  createPasswordReset,
  lookupPasswordReset,
} from "./password-reset";
import {
  addObject,
  addTasks,
  assignRoom,
  createRoom,
  listRoomContents,
  setTaskActive,
} from "./rooms";
import {
  completeTask,
  householdLeaderboard,
  listTaskViews,
  taskHistory,
} from "./tasks";

const NOW = new Date("2026-10-18T10:00:00Z");
const later = (days: number) => new Date(NOW.getTime() + days * DAY_MS);

function setup() {
  const db = testDb();
  addUser(db, "max");
  addUser(db, "anna");
  addUser(db, "ben");
  const h = createHousehold(db, {
    userId: "max",
    name: "WG Sonnenallee",
    expectedMemberCount: 3,
  });
  for (const u of ["anna", "ben"]) {
    const i = createInvite(db, {
      householdId: h.id,
      actorId: "max",
      validDays: 7,
      singleUse: true,
      now: NOW,
    });
    acceptInvite(db, { token: i.token, userId: u, now: NOW });
  }
  const bath = createRoom(db, {
    householdId: h.id,
    actorId: "max",
    type: "bath",
    name: "Bad",
  });
  const toilet = addObject(db, {
    householdId: h.id,
    viewerId: "max",
    roomId: bath.id,
    type: "toilet",
  });
  const [klo] = addTasks(db, {
    householdId: h.id,
    viewerId: "max",
    objectId: toilet.id,
    tasks: [
      {
        name: "Klo putzen",
        intervalDays: 7,
        multiplier: 1.5,
        lastDone: "today",
      },
    ],
    now: NOW,
  });
  return { db, h, bath, toilet, klo };
}

const expectDomainError = (fn: () => unknown, message: RegExp) => {
  expect(fn).toThrow(DomainError);
  expect(fn).toThrow(message);
};

describe("Haushalt & Rollen", () => {
  it("macht die erstellende Person zum ersten Admin", () => {
    const { db, h } = setup();
    expect(listHouseholdsOf(db, "max")).toEqual([
      { id: h.id, name: "WG Sonnenallee", emoji: null, role: "admin" },
    ]);
    expect(listMembers(db, h.id).map((m) => [m.userId, m.role])).toEqual([
      ["max", "admin"],
      ["anna", "member"],
      ["ben", "member"],
    ]);
  });

  it("schützt den Ersteller vor anderen Admins", () => {
    const { db, h } = setup();
    setRole(db, {
      householdId: h.id,
      actorId: "max",
      targetId: "anna",
      role: "admin",
    });
    expectDomainError(
      () =>
        setRole(db, {
          householdId: h.id,
          actorId: "anna",
          targetId: "max",
          role: "member",
        }),
      /nur selbst/,
    );
    expectDomainError(
      () =>
        removeMember(db, {
          householdId: h.id,
          actorId: "anna",
          targetId: "max",
        }),
      /nicht entfernt/,
    );
    // Selbst abgeben ist erlaubt, solange ein Admin bleibt.
    setRole(db, {
      householdId: h.id,
      actorId: "max",
      targetId: "max",
      role: "member",
    });
  });

  it("lässt immer mindestens einen Admin übrig", () => {
    const { db, h } = setup();
    expectDomainError(
      () =>
        setRole(db, {
          householdId: h.id,
          actorId: "max",
          targetId: "max",
          role: "member",
        }),
      /mindestens ein Admin/,
    );
  });

  it("verbietet Mitgliedern Admin-Aktionen", () => {
    const { db, h } = setup();
    expectDomainError(
      () =>
        setRole(db, {
          householdId: h.id,
          actorId: "anna",
          targetId: "ben",
          role: "admin",
        }),
      /Nur Admins/,
    );
    expectDomainError(
      () =>
        createRoom(db, {
          householdId: h.id,
          actorId: "anna",
          type: "kitchen",
          name: "K",
        }),
      /Nur Admins/,
    );
  });
});

describe("Einladungen", () => {
  it("lehnt verbrauchte, abgelaufene und widerrufene Links ab", () => {
    const db = testDb();
    for (const u of ["max", "a", "b", "c", "d"]) addUser(db, u);
    const h = createHousehold(db, {
      userId: "max",
      name: "WG",
      expectedMemberCount: 4,
    });
    const once = createInvite(db, {
      householdId: h.id,
      actorId: "max",
      validDays: 7,
      singleUse: true,
      now: NOW,
    });
    acceptInvite(db, { token: once.token, userId: "a", now: NOW });
    expectDomainError(
      () => acceptInvite(db, { token: once.token, userId: "b", now: NOW }),
      /schon verwendet/,
    );

    const multi = createInvite(db, {
      householdId: h.id,
      actorId: "max",
      validDays: 7,
      singleUse: false,
      now: NOW,
    });
    acceptInvite(db, { token: multi.token, userId: "b", now: NOW });
    acceptInvite(db, { token: multi.token, userId: "c", now: NOW });
    expectDomainError(
      () =>
        acceptInvite(db, { token: multi.token, userId: "d", now: later(8) }),
      /abgelaufen/,
    );

    revokeInvite(db, {
      householdId: h.id,
      actorId: "max",
      inviteId: multi.id,
      now: NOW,
    });
    expectDomainError(
      () => acceptInvite(db, { token: multi.token, userId: "d", now: NOW }),
      /widerrufen/,
    );
  });

  it("ist für bestehende Mitglieder idempotent", () => {
    const { db, h } = setup();
    const i = createInvite(db, {
      householdId: h.id,
      actorId: "max",
      validDays: 7,
      singleUse: true,
      now: NOW,
    });
    expect(
      acceptInvite(db, { token: i.token, userId: "anna", now: NOW }),
    ).toEqual({
      householdId: h.id,
      joined: false,
    });
  });
});

describe("Aufgaben & Erledigen", () => {
  it("berechnet Status und Punkte rollierend", () => {
    const { db, h, klo } = setup();
    const view = (now: Date) =>
      listTaskViews(db, { householdId: h.id, viewerId: "anna", now })[0];
    expect(view(NOW)).toMatchObject({ status: "fresh", pointsNow: 0 });
    expect(view(later(2))).toMatchObject({ status: "fresh", pointsNow: 3 }); // 2 × 1,5
    expect(view(later(4))).toMatchObject({ status: "sweet", pointsNow: 4.5 });
    expect(view(later(10))).toMatchObject({
      status: "overdue",
      pointsNow: 4.5,
    });

    const r = completeTask(db, {
      householdId: h.id,
      userId: "anna",
      taskId: klo.id,
      idempotencyKey: "k1",
      now: later(10),
    });
    expect(r).toMatchObject({ points: 4.5, duplicate: false });
    expect(view(later(10))).toMatchObject({ status: "fresh", progress: 0 });
    expect(view(later(10)).dueAt).toEqual(later(17));
  });

  it("vergibt unter 15 % keine Punkte", () => {
    const { db, h, klo } = setup();
    const r = completeTask(db, {
      householdId: h.id,
      userId: "ben",
      taskId: klo.id,
      idempotencyKey: "k",
      now: later(1),
    });
    expect(r).toMatchObject({ points: 0, belowMinimum: true });
  });

  it("zählt Doppel-Taps nur einmal", () => {
    const { db, h, klo } = setup();
    const args = {
      householdId: h.id,
      userId: "ben",
      taskId: klo.id,
      idempotencyKey: "same",
      now: later(5),
    };
    completeTask(db, args);
    expect(completeTask(db, args)).toMatchObject({
      duplicate: true,
      points: 4.5,
    });
    expect(taskHistory(db, klo.id)).toHaveLength(1);
  });

  it("startet die Zählung bei Reaktivierung neu", () => {
    const { db, h, klo } = setup();
    setTaskActive(db, {
      householdId: h.id,
      viewerId: "max",
      taskId: klo.id,
      active: false,
      now: later(3),
    });
    const paused = listTaskViews(db, {
      householdId: h.id,
      viewerId: "max",
      now: later(60),
    })[0];
    expect(paused.status).toBe("paused");
    expectDomainError(
      () =>
        completeTask(db, {
          householdId: h.id,
          userId: "max",
          taskId: klo.id,
          idempotencyKey: "p",
          now: later(60),
        }),
      /pausiert/,
    );
    setTaskActive(db, {
      householdId: h.id,
      viewerId: "max",
      taskId: klo.id,
      active: true,
      now: later(60),
    });
    expect(
      listTaskViews(db, {
        householdId: h.id,
        viewerId: "max",
        now: later(60),
      })[0],
    ).toMatchObject({
      status: "fresh",
      progress: 0,
    });
  });

  it("startet „vor ein paar Tagen“ bei 50 %", () => {
    const { db, h, toilet } = setup();
    addTasks(db, {
      householdId: h.id,
      viewerId: "max",
      objectId: toilet.id,
      tasks: [
        {
          name: "Fliesen",
          intervalDays: 14,
          multiplier: 1,
          lastDone: "unknown",
        },
      ],
      now: NOW,
    });
    const v = listTaskViews(db, {
      householdId: h.id,
      viewerId: "max",
      now: NOW,
    }).find((t) => t.name === "Fliesen");
    expect(v?.progress).toBe(0.5);
  });
});

describe("Private Zimmer (Spez. 4.2)", () => {
  function withPrivateRoom() {
    const s = setup();
    const zimmer = createRoom(s.db, {
      householdId: s.h.id,
      actorId: "max",
      type: "bedroom",
      name: "Annas Zimmer",
      privateOwnerId: "anna",
    });
    return { ...s, zimmer };
  }

  it("darf nur von der Besitzerin eingerichtet werden, nicht vom Admin", () => {
    const { db, h, zimmer } = withPrivateRoom();
    expectDomainError(
      () =>
        addObject(db, {
          householdId: h.id,
          viewerId: "max",
          roomId: zimmer.id,
          type: "plant",
        }),
      /nur die Person/,
    );
    const plant = addObject(db, {
      householdId: h.id,
      viewerId: "anna",
      roomId: zimmer.id,
      type: "plant",
    });
    addTasks(db, {
      householdId: h.id,
      viewerId: "anna",
      objectId: plant.id,
      tasks: [
        {
          name: "Gießen",
          intervalDays: 4,
          multiplier: 0.5,
          lastDone: "unknown",
        },
      ],
      now: NOW,
    });
  });

  it("ist für andere unsichtbar und bringt keine Punkte", () => {
    const { db, h, zimmer } = withPrivateRoom();
    const plant = addObject(db, {
      householdId: h.id,
      viewerId: "anna",
      roomId: zimmer.id,
      type: "plant",
    });
    const [giessen] = addTasks(db, {
      householdId: h.id,
      viewerId: "anna",
      objectId: plant.id,
      tasks: [
        {
          name: "Gießen",
          intervalDays: 4,
          multiplier: 0.5,
          lastDone: "unknown",
        },
      ],
      now: NOW,
    });

    const names = (viewer: string) =>
      listTaskViews(db, { householdId: h.id, viewerId: viewer, now: NOW }).map(
        (t) => t.name,
      );
    expect(names("anna")).toContain("Gießen");
    expect(names("max")).not.toContain("Gießen"); // auch nicht für Admins
    expect(names("ben")).not.toContain("Gießen");

    expectDomainError(
      () =>
        completeTask(db, {
          householdId: h.id,
          userId: "max",
          taskId: giessen.id,
          idempotencyKey: "x",
          now: NOW,
        }),
      /nicht gefunden/,
    );
    const r = completeTask(db, {
      householdId: h.id,
      userId: "anna",
      taskId: giessen.id,
      idempotencyKey: "y",
      now: NOW,
    });
    expect(r).toMatchObject({
      points: 0,
      isPrivate: true,
      belowMinimum: false,
    });
    expect(
      householdLeaderboard(db, {
        householdId: h.id,
        period: "total",
        now: NOW,
      }).find((e) => e.userId === "anna")?.completions,
    ).toBe(0);
  });

  it("wird beim Auszug geleert, der Umriss bleibt", () => {
    const { db, h, zimmer } = withPrivateRoom();
    addObject(db, {
      householdId: h.id,
      viewerId: "anna",
      roomId: zimmer.id,
      type: "plant",
    });
    removeMember(db, { householdId: h.id, actorId: "max", targetId: "anna" });
    const contents = listRoomContents(db, zimmer.id);
    expect(contents.map((o) => o.type)).toEqual(["floor"]);
  });

  it("verliert beim Neuzuweisen den Inhalt der vorherigen Besitzerin", () => {
    const { db, h, zimmer } = withPrivateRoom();
    addObject(db, {
      householdId: h.id,
      viewerId: "anna",
      roomId: zimmer.id,
      type: "plant",
    });
    assignRoom(db, {
      householdId: h.id,
      actorId: "max",
      roomId: zimmer.id,
      privateOwnerId: "ben",
    });
    expect(listRoomContents(db, zimmer.id).map((o) => o.type)).toEqual([
      "floor",
    ]);
  });
});

describe("Rangliste", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it("zeigt Rohpunkte für den laufenden Monat und gesamt", () => {
    const { db, h, klo } = s;
    // 18.10. +5 Tage → Oktober; +20 Tage → 7.11.
    completeTask(db, {
      householdId: h.id,
      userId: "anna",
      taskId: klo.id,
      idempotencyKey: "a",
      now: later(5),
    });
    completeTask(db, {
      householdId: h.id,
      userId: "ben",
      taskId: klo.id,
      idempotencyKey: "b",
      now: later(20),
    });

    const month = householdLeaderboard(db, {
      householdId: h.id,
      period: "month",
      now: later(20),
    });
    expect(month[0]).toMatchObject({ userId: "ben", points: 4.5, rank: 1 });
    expect(Object.fromEntries(month.map((e) => [e.userId, e.points]))).toEqual({
      ben: 4.5,
      anna: 0,
      max: 0,
    });
    const total = householdLeaderboard(db, {
      householdId: h.id,
      period: "total",
      now: later(20),
    });
    expect(
      total
        .filter((e) => e.points > 0)
        .map((e) => e.userId)
        .sort(),
    ).toEqual(["anna", "ben"]);
  });
});

describe("Passwort-Reset (Spez. 2.3)", () => {
  it("setzt das Passwort einmalig und meldet Sitzungen ab", () => {
    const { db, h } = setup();
    db.insert(session)
      .values({
        id: "s1",
        token: "t",
        userId: "ben",
        expiresAt: later(30),
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
    const token = createPasswordReset(db, {
      householdId: h.id,
      actorId: "max",
      targetId: "ben",
      now: NOW,
    });
    expect(lookupPasswordReset(db, token, NOW)?.userName).toBe("ben");

    consumePasswordReset(db, { token, passwordHash: "neu", now: NOW });
    expect(
      db.select().from(account).where(eq(account.userId, "ben")).get()
        ?.password,
    ).toBe("neu");
    expect(db.select().from(session).all()).toHaveLength(0);
    expect(lookupPasswordReset(db, token, NOW)).toBeNull();
    expectDomainError(
      () => consumePasswordReset(db, { token, passwordHash: "x", now: NOW }),
      /ungültig/,
    );
  });

  it("ist nur für Admins und nur 24 h gültig", () => {
    const { db, h } = setup();
    expectDomainError(
      () =>
        createPasswordReset(db, {
          householdId: h.id,
          actorId: "anna",
          targetId: "ben",
          now: NOW,
        }),
      /Nur Admins/,
    );
    const token = createPasswordReset(db, {
      householdId: h.id,
      actorId: "max",
      targetId: "ben",
      now: NOW,
    });
    expect(lookupPasswordReset(db, token, later(1.1))).toBeNull();
  });
});
