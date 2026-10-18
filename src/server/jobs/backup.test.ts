import {
  existsSync,
  mkdtempSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createDatabase, runMigrations } from "@/db/client";
import { runDailyBackup } from "./backup";

describe("runDailyBackup", () => {
  it("legt ein lesbares Backup pro Tag an und räumt alte auf", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hrp-backup-"));
    const db = createDatabase(path.join(dir, "hrp.sqlite"));
    runMigrations(db);
    mkdirSync(path.join(dir, "backups"));
    writeFileSync(path.join(dir, "backups", "hrp-2026-09-01.sqlite"), "");

    const now = new Date("2026-10-18T03:00:00Z");
    const first = runDailyBackup(db, dir, now);
    expect(first.created).toBe(true);
    expect(first.removed).toEqual(["hrp-2026-09-01.sqlite"]);
    expect(runDailyBackup(db, dir, now).created).toBe(false);

    const copy = new Database(first.file, { readonly: true });
    expect(
      copy
        .prepare("select count(*) n from sqlite_master where name = 'task'")
        .get(),
    ).toEqual({ n: 1 });
    expect(readdirSync(path.join(dir, "backups"))).toEqual([
      "hrp-2026-10-18.sqlite",
    ]);
    expect(existsSync(first.file)).toBe(true);
  });
});
