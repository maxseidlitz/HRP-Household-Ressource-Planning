import { getDb } from "@/db";
import { env } from "@/lib/env";
import { runDailyBackup } from "./backup";
import { runObjectionJobs } from "../queries/objections";
import { webPushSender } from "../push-sender";
import { runNotificationJobs } from "./notifications";
import { dispatchPush } from "./push";

const MINUTES = 60 * 1000;
const PUSH_INTERVAL_MS = 10_000;

/**
 * In-Process-Scheduler (Spez. 10). Ein Container, ein Prozess: alle fünf
 * Minuten Abstimmungen abschließen und Mitteilungen prüfen, einmal täglich
 * ein Backup anlegen, alle zehn Sekunden neue Mitteilungen pushen.
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

  // Web Push (Phase 5): neue Mitteilungen zeitnah zustellen. Ein Lauf nach
  // dem anderen, damit langsame Push-Dienste sich nicht überholen.
  let pushing = false;
  const push = async () => {
    if (pushing) return;
    pushing = true;
    try {
      await dispatchPush(getDb(), webPushSender, new Date());
    } catch (e) {
      console.error("[push] fehlgeschlagen", e);
    } finally {
      pushing = false;
    }
  };
  setInterval(push, PUSH_INTERVAL_MS).unref();
}
