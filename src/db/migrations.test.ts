import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase, runMigrations } from "./client";
import { commitment, household, task, user } from "./schema";

function freshDb() {
  const db = createDatabase(":memory:");
  runMigrations(db);
  return db;
}

describe("Migrationen", () => {
  it("legen alle Tabellen des Datenmodells an", () => {
    const tables = freshDb()
      .all<{ name: string }>(
        sql`select name from sqlite_master where type = 'table' order by name`,
      )
      .map((r) => r.name)
      .filter((n) => !n.startsWith("sqlite_") && !n.startsWith("__"));
    expect(tables).toEqual(
      [
        "absence",
        "account",
        "analytics_event",
        "commitment",
        "completion",
        "feature_vote",
        "feedback_ticket",
        "household",
        "invite",
        "membership",
        "notification",
        "object",
        "object_group",
        "objection",
        "objection_vote",
        "password_reset",
        "room",
        "session",
        "task",
        "user",
        "vacation_bundle",
        "vacation_linked_task",
        "verification",
      ].sort(),
    );
  });

  it("erlauben pro Aufgabe nur eine offene Einplanung", async () => {
    const db = freshDb();
    const now = new Date();
    db.insert(user)
      .values({
        id: "u1",
        name: "Max",
        email: "m@x",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(household)
      .values({ id: "h1", name: "WG", createdByUserId: "u1" })
      .run();
    db.run(
      sql`insert into room (id, household_id, type, name) values ('r1', 'h1', 'bath', 'Bad')`,
    );
    db.run(
      sql`insert into object (id, household_id, room_id, type, name) values ('o1', 'h1', 'r1', 'toilet', 'Klo')`,
    );
    db.insert(task)
      .values({
        id: "t1",
        householdId: "h1",
        objectId: "o1",
        name: "Klo putzen",
        intervalDays: 7,
        baselineAt: now,
      })
      .run();

    db.insert(commitment)
      .values({ taskId: "t1", userId: "u1", plannedFor: now })
      .run();
    expect(() =>
      db
        .insert(commitment)
        .values({ taskId: "t1", userId: "u1", plannedFor: now })
        .run(),
    ).toThrow(/UNIQUE/);

    // Erledigte Einplanungen blockieren keine neue.
    db.update(commitment).set({ status: "fulfilled" }).run();
    db.insert(commitment)
      .values({ taskId: "t1", userId: "u1", plannedFor: now })
      .run();
  });
});
