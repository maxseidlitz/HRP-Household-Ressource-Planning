import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createDatabase, type Connection } from "./client";
import { env } from "@/lib/env";

const globalForDb = globalThis as unknown as { __db?: Connection };

/**
 * Öffnet die Datenbank beim ersten Zugriff (nicht schon beim Import), damit
 * `next build` keine Datei anlegt. Im Dev-Modus überlebt die Verbindung
 * Hot Reloads.
 */
export function getDb(): Connection {
  if (!globalForDb.__db) {
    mkdirSync(env.DATA_DIR, { recursive: true });
    globalForDb.__db = createDatabase(path.join(env.DATA_DIR, "hrp.sqlite"));
  }
  return globalForDb.__db;
}
