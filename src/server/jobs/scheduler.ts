import { getDb } from "@/db";
import { env } from "@/lib/env";
import { runDailyBackup } from "./backup";

const HOUR = 60 * 60 * 1000;

/**
 * In-Process-Scheduler (Spez. 10). Ein Container, ein Prozess: ein einfacher
 * Stundentakt genügt. Weitere Jobs (Mitteilungen) folgen in Phase 3.
 */
export function startScheduler() {
  const tick = () => {
    try {
      const r = runDailyBackup(getDb(), env.DATA_DIR);
      if (r.created) console.log(`[backup] ${r.file}`);
    } catch (e) {
      console.error("[backup] fehlgeschlagen", e);
    }
  };
  setTimeout(tick, 60_000).unref();
  setInterval(tick, HOUR).unref();
}
