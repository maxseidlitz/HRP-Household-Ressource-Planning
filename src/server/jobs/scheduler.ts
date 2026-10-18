import { getDb } from "@/db";
import { env } from "@/lib/env";
import { runDailyBackup } from "./backup";
import { runObjectionJobs } from "../queries/objections";
import { runNotificationJobs } from "./notifications";

const MINUTES = 60 * 1000;

/**
 * In-Process-Scheduler (Spez. 10). Ein Container, ein Prozess: alle fünf
 * Minuten Abstimmungen abschließen und Mitteilungen prüfen, einmal täglich
 * ein Backup anlegen.
 */
export function startScheduler() {
  const tick = () => {
    const db = getDb();
    try {
      runObjectionJobs(db, new Date());
    } catch (e) {
      console.error("[widerspruch] fehlgeschlagen", e);
    }
    try {
      runNotificationJobs(db, new Date());
    } catch (e) {
      console.error("[mitteilungen] fehlgeschlagen", e);
    }
    try {
      const r = runDailyBackup(db, env.DATA_DIR);
      if (r.created) console.log(`[backup] ${r.file}`);
    } catch (e) {
      console.error("[backup] fehlgeschlagen", e);
    }
  };
  setTimeout(tick, 20_000).unref();
  setInterval(tick, 5 * MINUTES).unref();
}
