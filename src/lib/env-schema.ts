import { z } from "zod";

const schema = z.object({
  /** Verzeichnis für SQLite-Datei, Secret, Uploads und Backups (Docker-Volume). */
  DATA_DIR: z.string().default("./data"),
  /**
   * Feste Basis-URL, z. B. http://192.168.1.20:3000. Leer lassen, dann wird
   * die URL aus dem Host-Header der Anfrage abgeleitet (siehe ALLOWED_HOSTS).
   */
  BETTER_AUTH_URL: z.url().optional(),
  /** Kommagetrennte Hostnamen (mit Port), unter denen die App erreichbar ist. */
  ALLOWED_HOSTS: z
    .string()
    .default("*")
    .transform((v) =>
      v
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean),
    ),
  /** http im Heimnetz, https nach dem Umzug (Phase 5). */
  APP_PROTOCOL: z.enum(["http", "https"]).default("http"),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const normalized = Object.fromEntries(
    Object.entries(source).map(([k, v]) => [k, v === "" ? undefined : v]),
  );
  return schema.parse(normalized);
}
