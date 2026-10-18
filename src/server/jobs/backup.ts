import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import type { DB } from "@/db/client";
import { sql } from "drizzle-orm";

const PREFIX = "hrp-";
const KEEP_DAYS = 14;

/**
 * Tägliches Backup per VACUUM INTO (konsistent trotz WAL-Modus). Legt höchstens
 * ein Backup pro Tag an und löscht Backups, die älter als 14 Tage sind.
 */
export function runDailyBackup(db: DB, dataDir: string, now = new Date()) {
  const dir = path.join(dataDir, "backups");
  mkdirSync(dir, { recursive: true });
  const day = now.toISOString().slice(0, 10);
  const file = path.join(dir, `${PREFIX}${day}.sqlite`);

  let created = false;
  if (!readdirSync(dir).includes(path.basename(file))) {
    db.run(sql`VACUUM INTO ${file}`);
    created = true;
  }

  const cutoff = now.getTime() - KEEP_DAYS * 86_400_000;
  const removed: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.startsWith(PREFIX) || !name.endsWith(".sqlite")) continue;
    const date = Date.parse(name.slice(PREFIX.length, -".sqlite".length));
    const stamp = Number.isNaN(date)
      ? statSync(path.join(dir, name)).mtimeMs
      : date;
    if (stamp < cutoff) {
      unlinkSync(path.join(dir, name));
      removed.push(name);
    }
  }
  return { file, created, removed };
}
