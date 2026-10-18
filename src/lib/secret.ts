import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Liefert das Auth-Secret. Ist keins per Umgebungsvariable gesetzt, wird beim
 * ersten Start eins erzeugt und im Datenverzeichnis abgelegt, damit die
 * Installation auf ZimaOS ohne manuelle Konfiguration funktioniert.
 */
export function resolveAuthSecret(dataDir: string, fromEnv?: string): string {
  if (fromEnv) return fromEnv;
  const file = path.join(dataDir, ".auth-secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  mkdirSync(dataDir, { recursive: true });
  const secret = randomBytes(32).toString("base64");
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}
