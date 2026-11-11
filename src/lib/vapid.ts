import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";

export type VapidKeys = { publicKey: string; privateKey: string };

/**
 * VAPID-Schlüssel für Web Push. Sind keine per Umgebungsvariable gesetzt,
 * wird beim ersten Bedarf ein Paar erzeugt und im Datenordner gespeichert.
 * Wechselt das Paar, werden alle bestehenden Abos ungültig.
 */
export function resolveVapidKeys(
  dataDir: string,
  fromEnv: { publicKey?: string; privateKey?: string },
): VapidKeys {
  if (fromEnv.publicKey && fromEnv.privateKey)
    return { publicKey: fromEnv.publicKey, privateKey: fromEnv.privateKey };
  const file = path.join(dataDir, ".vapid.json");
  if (existsSync(file)) {
    const keys = JSON.parse(readFileSync(file, "utf8")) as VapidKeys;
    if (keys.publicKey && keys.privateKey) return keys;
  }
  mkdirSync(dataDir, { recursive: true });
  const keys = webpush.generateVAPIDKeys();
  writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
  return keys;
}
