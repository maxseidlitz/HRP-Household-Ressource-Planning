import { describe, expect, it } from "vitest";
import { notification } from "@/db/schema";
import { DAY_MS } from "@/domain/progress";
import { addUser, testDb } from "@/test/db";
import { DomainError } from "../errors";
import { createAbsence } from "./absences";
import { track } from "./analytics";
import { exportHousehold } from "./export";
import {
  createFeedback,
  getFeedback,
  listFeedback,
  updateFeedback,
} from "./feedback";
import { createHousehold, getHousehold } from "./households";
import { acceptInvite, createInvite } from "./invites";
import {
  canObject,
  castObjectionVote,
  fileObjection,
  getObjectionView,
  pendingVotesFor,
  runObjectionJobs,
} from "./objections";
import { addObject, addTasks, createRoom } from "./rooms";
import { householdStats } from "./stats";
import {
  castFeatureVote,
  objectionVoteState,
  setObjectionsEnabled,
  updateThresholds,
} from "./settings";
import { completeTask, householdLeaderboard, listTaskViews } from "./tasks";

const NOW = new Date("2026-10-18T08:00:00Z");
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

function setup(names = ["max", "anna", "ben"]) {
  const db = testDb();
  for (const n of names) addUser(db, n, n[0].toUpperCase() + n.slice(1));
  const [admin, ...rest] = names;
  const h = createHousehold(db, {
    userId: admin,
    name: "WG",
    expectedMemberCount: names.length,
  });
  for (const u of rest) {
    const i = createInvite(db, {
      householdId: h.id,
      actorId: admin,
      validDays: 7,
      singleUse: true,
      now: NOW,
    });
    acceptInvite(db, { token: i.token, userId: u, now: NOW });
  }
  const bath = createRoom(db, {
    householdId: h.id,
    actorId: admin,
    type: "bath",
    name: "Bad",
  });
  const base = { householdId: h.id, viewerId: admin, now: NOW };
  const toilet = addObject(db, { ...base, roomId: bath.id, type: "toilet" });
  const [klo] = addTasks(db, {
    ...base,
    objectId: toilet.id,
    tasks: [
      {
        name: "Klo putzen",
        intervalDays: 4,
        multiplier: 1.5,
        lastDone: "some_days",
      },
    ],
  });
  return { db, h, klo };
}

const points = (db: ReturnType<typeof testDb>, hid: string, uid: string) =>
  householdLeaderboard(db, {
    householdId: hid,
    period: "total",
    now: at(48),
  }).find((e) => e.userId === uid)!.points;

describe("Widerspruchsfunktion aktivieren (Spez. 6.3)", () => {
  it("fragt alle, sobald die WG komplett ist, und aktiviert erst bei Einstimmigkeit", () => {
    const { db, h } = setup();
    const asked = db
      .select()
      .from(notification)
      .all()
      .filter((n) => n.type === "feature_vote_request")
      .map((n) => n.userId)
      .sort();
    expect(asked).toEqual(["anna", "ben", "max"]);

    castFeatureVote(db, { householdId: h.id, userId: "max", vote: true });
    castFeatureVote(db, { householdId: h.id, userId: "anna", vote: true });
    let s = objectionVoteState(db, { householdId: h.id, viewerId: "ben" });
    expect(s).toMatchObject({ yes: 2, total: 3, enabled: false, myVote: null });
    s = castFeatureVote(db, { householdId: h.id, userId: "ben", vote: true });
    expect(s).toMatchObject({ enabled: true, enabledBy: "vote" });
  });

  it("Admins dürfen allein einschalten, Mitglieder nicht", () => {
    const { db, h } = setup();
    expect(() =>
      setObjectionsEnabled(db, {
        householdId: h.id,
        actorId: "anna",
        enabled: true,
      }),
    ).toThrow(DomainError);
    setObjectionsEnabled(db, {
      householdId: h.id,
      actorId: "max",
      enabled: true,
    });
    expect(getHousehold(db, h.id)!.settings).toMatchObject({
      objectionsEnabled: true,
      objectionsEnabledBy: "admin",
    });
    const told = db
      .select()
      .from(notification)
      .all()
      .filter((n) => n.type === "objections_enabled")
      .map((n) => n.userId)
      .sort();
    expect(told).toEqual(["anna", "ben"]);
  });

  it("prüft die Schwellen", () => {
    const { db, h } = setup();
    const base = {
      householdId: h.id,
      actorId: "max",
      earlyThreshold: 0.5,
      lateThreshold: 1.2,
      minProgress: 0.2,
      icsAlarmMinutes: 60,
    };
    updateThresholds(db, base);
    expect(getHousehold(db, h.id)!.settings).toMatchObject({
      earlyThreshold: 0.5,
      lateThreshold: 1.2,
      minProgress: 0.2,
      icsAlarmMinutes: 60,
    });
    expect(() => updateThresholds(db, { ...base, minProgress: 0.6 })).toThrow(
      /Mindestfortschritt/,
    );
    expect(() => updateThresholds(db, { ...base, actorId: "anna" })).toThrow(
      DomainError,
    );
  });
});

describe("Widerspruch (Spez. 6.3)", () => {
  function completed(names?: string[]) {
    const s = setup(names);
    setObjectionsEnabled(s.db, {
      householdId: s.h.id,
      actorId: names?.[0] ?? "max",
      enabled: true,
    });
    const doer = names?.[1] ?? "anna";
    const r = completeTask(s.db, {
      householdId: s.h.id,
      userId: doer,
      taskId: s.klo.id,
      idempotencyKey: "k1",
      now: NOW,
    });
    return { ...s, completionId: r.completionId, doer };
  }

  it("3er-WG: friert Punkte ein und setzt nach 24 h ohne weitere Stimmen zurück", () => {
    const { db, h, klo, completionId } = completed();
    expect(points(db, h.id, "anna")).toBe(4.5);
    const { objectionId, resolution } = fileObjection(db, {
      householdId: h.id,
      userId: "ben",
      completionId,
      now: at(2),
    });
    expect(resolution).toBeNull();
    // Eingefroren: keine Punkte, Aufgabe bleibt grün
    expect(points(db, h.id, "anna")).toBe(0);
    expect(
      listTaskViews(db, { householdId: h.id, viewerId: "max", now: at(3) })[0]
        .lastCompletedAt,
    ).toEqual(NOW);
    expect(
      pendingVotesFor(db, { householdId: h.id, viewerId: "max", now: at(3) }),
    ).toHaveLength(1);

    const byUser = (type: string) =>
      db
        .select()
        .from(notification)
        .all()
        .filter((n) => n.type === type)
        .map((n) => n.userId);
    expect(byUser("objection_filed")).toEqual(["anna"]);
    expect(byUser("objection_vote")).toEqual(["max"]);

    expect(runObjectionJobs(db, at(20))).toBe(0);
    expect(runObjectionJobs(db, at(27))).toBe(1);
    const v = getObjectionView(db, {
      objectionId,
      viewerId: "max",
      now: at(27),
    })!;
    expect(v.resolution).toBe("revoked");
    expect(points(db, h.id, "anna")).toBe(0);
    // Fälligkeit springt zurück auf den alten Bezugspunkt
    const t = listTaskViews(db, {
      householdId: h.id,
      viewerId: "max",
      now: at(27),
    })[0];
    expect(t.lastCompletedAt).toBeNull();
    expect(t.id).toBe(klo.id);
    expect(byUser("objection_resolved").sort()).toEqual(["anna", "ben"]);
  });

  it("4er-WG: 1:1 → bleibt gültig, Punkte zählen wieder", () => {
    const { db, h, completionId } = completed(["max", "anna", "ben", "cleo"]);
    const { objectionId } = fileObjection(db, {
      householdId: h.id,
      userId: "ben",
      completionId,
      now: at(1),
    });
    expect(
      castObjectionVote(db, {
        objectionId,
        userId: "cleo",
        vote: "confirm",
        now: at(2),
      }),
    ).toBeNull();
    expect(() =>
      castObjectionVote(db, {
        objectionId,
        userId: "anna",
        vote: "confirm",
        now: at(2),
      }),
    ).toThrow(/nicht stimmberechtigt/);
    runObjectionJobs(db, at(26));
    expect(
      getObjectionView(db, { objectionId, viewerId: "max", now: at(26) })!
        .resolution,
    ).toBe("valid");
    expect(points(db, h.id, "anna")).toBe(4.5);
  });

  it("2er-WG: ein Widerspruch setzt sofort zurück", () => {
    const { db, h, completionId } = completed(["max", "anna"]);
    const r = fileObjection(db, {
      householdId: h.id,
      userId: "max",
      completionId,
      now: at(1),
    });
    expect(r.resolution).toBe("revoked");
  });

  it("Urlauber stimmen nicht mit und können nicht widersprechen", () => {
    const { db, h, completionId } = completed();
    createAbsence(db, {
      userId: "max",
      from: at(-1),
      to: new Date(NOW.getTime() + 5 * DAY_MS),
      now: at(-2),
    });
    expect(
      canObject(db, { viewerId: "max", completionId, now: at(1) }),
    ).toMatch(/Urlaub/);
    // Nur Ben ist stimmberechtigt → sein Widerspruch entscheidet sofort
    expect(
      fileObjection(db, {
        householdId: h.id,
        userId: "ben",
        completionId,
        now: at(1),
      }).resolution,
    ).toBe("revoked");
  });

  it("nur innerhalb von 24 h, nur einmal und nicht gegen sich selbst", () => {
    const { db, h, completionId } = completed();
    expect(
      canObject(db, { viewerId: "anna", completionId, now: at(1) }),
    ).toMatch(/eigenen/);
    expect(
      canObject(db, { viewerId: "ben", completionId, now: at(25) }),
    ).toMatch(/24 Stunden/);
    fileObjection(db, {
      householdId: h.id,
      userId: "ben",
      completionId,
      now: at(1),
    });
    expect(() =>
      fileObjection(db, {
        householdId: h.id,
        userId: "max",
        completionId,
        now: at(2),
      }),
    ).toThrow(/schon/);
  });

  it("ist aus, solange niemand sie einschaltet", () => {
    const { db, h, klo } = setup();
    const r = completeTask(db, {
      householdId: h.id,
      userId: "anna",
      taskId: klo.id,
      idempotencyKey: "x",
      now: NOW,
    });
    expect(
      canObject(db, {
        viewerId: "ben",
        completionId: r.completionId,
        now: at(1),
      }),
    ).toMatch(/aus/);
  });
});

describe("Feedback, Statistik, Export (Spez. 9)", () => {
  it("Feedback: senden, Admin antwortet, Absender bekommt eine Mitteilung", () => {
    const { db, h } = setup();
    expect(() =>
      createFeedback(db, {
        householdId: h.id,
        userId: "anna",
        category: "bug",
        text: "x",
        context: {},
        now: NOW,
      }),
    ).toThrow(/beschreiben/);
    const t = createFeedback(db, {
      householdId: h.id,
      userId: "anna",
      category: "bug",
      text: "Der Knopf ist kaputt",
      context: { screen: "/aufgaben", userAgent: "Test" },
      now: NOW,
    });
    expect(listFeedback(db, { householdId: h.id })).toHaveLength(1);
    expect(listFeedback(db, { householdId: h.id, userId: "ben" })).toHaveLength(
      0,
    );
    const update = {
      householdId: h.id,
      ticketId: t.id,
      status: "done",
      adminNote: "war ein Tippfehler",
      adminReply: "Behoben, danke!",
      now: at(1),
    };
    expect(() => updateFeedback(db, { ...update, actorId: "anna" })).toThrow(
      DomainError,
    );
    updateFeedback(db, { ...update, actorId: "max" });
    // gleiche Antwort nochmal speichern → keine zweite Mitteilung
    updateFeedback(db, { ...update, actorId: "max" });
    const replies = db
      .select()
      .from(notification)
      .all()
      .filter((n) => n.type === "feedback_reply");
    expect(replies.map((n) => n.userId)).toEqual(["anna"]);
    expect(
      getFeedback(db, { householdId: h.id, ticketId: t.id })!.ticket,
    ).toMatchObject({ status: "done", adminReply: "Behoben, danke!" });
  });

  it("Statistik: Aufgaben-Kennzahlen ohne private Zimmer", () => {
    const { db, h, klo } = setup();
    const own = createRoom(db, {
      householdId: h.id,
      actorId: "max",
      type: "bedroom",
      name: "Annas Zimmer",
      privateOwnerId: "anna",
    });
    const plant = addObject(db, {
      householdId: h.id,
      viewerId: "anna",
      roomId: own.id,
      type: "plant",
    });
    const [giessen] = addTasks(db, {
      householdId: h.id,
      viewerId: "anna",
      objectId: plant.id,
      now: NOW,
      tasks: [
        {
          name: "Gießen",
          intervalDays: 3,
          multiplier: 1,
          lastDone: "some_days",
        },
      ],
    });
    for (const [taskId, key] of [
      [klo.id, "a"],
      [giessen.id, "b"],
    ])
      completeTask(db, {
        householdId: h.id,
        userId: "anna",
        taskId,
        idempotencyKey: key,
        now: NOW,
      });
    track(db, {
      name: "screen_view",
      screen: "aufgaben",
      householdId: h.id,
      userId: "anna",
    });
    const s = householdStats(db, {
      householdId: h.id,
      viewerId: "anna",
      days: 7,
      now: at(1),
      timeZone: "Europe/Berlin",
    });
    expect(s.tasks.completions).toBe(1);
    expect(s.tasks.avgProgress).toBeCloseTo(0.5);
    expect(s.tasks.most.map((t) => t.name)).toEqual(["Klo putzen"]);
    expect(s.screens).toEqual([{ key: "aufgaben", count: 1 }]);

    const data = exportHousehold(db, {
      householdId: h.id,
      actorId: "max",
      now: at(1),
    });
    const json = JSON.stringify(data);
    expect(json).not.toContain("Annas Zimmer");
    expect(json).not.toContain("Gießen");
    expect(data.tasks.map((t) => t.name)).toEqual(["Klo putzen"]);
    expect(data.completions).toHaveLength(1);
    expect(() =>
      exportHousehold(db, { householdId: h.id, actorId: "anna", now: at(1) }),
    ).toThrow(DomainError);
  });
});
