import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { RunResult } from "better-sqlite3";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import * as schema from "./schema";

export function createDatabase(file: string) {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return drizzle(sqlite, { schema });
}

/** Die geöffnete Datenbankverbindung. */
export type Connection = ReturnType<typeof createDatabase>;

/**
 * Verbindung oder laufende Transaktion. Abfragen nehmen diesen Typ, damit
 * sie in einer Transaktion ohne Cast weiterverwendet werden können.
 */
export type DB = BaseSQLiteDatabase<"sync", RunResult, typeof schema>;

export function runMigrations(db: Connection) {
  migrate(db, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
}
