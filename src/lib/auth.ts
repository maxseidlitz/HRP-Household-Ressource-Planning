import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { headers } from "next/headers";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { env } from "./env";
import { resolveAuthSecret } from "./secret";

function createAuth() {
  return betterAuth({
    appName: "WG-App",
    secret: resolveAuthSecret(env.DATA_DIR, env.BETTER_AUTH_SECRET),
    // Ohne feste URL wird sie aus dem Host der Anfrage gebildet. So klappt der
    // Zugriff über IP und Hostnamen gleichermaßen. Über http setzt Better Auth
    // automatisch keine Secure-Cookies (sonst würde der Browser sie verwerfen).
    baseURL: env.BETTER_AUTH_URL ?? {
      allowedHosts: env.ALLOWED_HOSTS,
      protocol: env.APP_PROTOCOL,
    },
    database: drizzleAdapter(getDb(), {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
    },
    user: {
      additionalFields: {
        avatarJson: { type: "string", required: false, input: false },
        lastHouseholdId: { type: "string", required: false, input: false },
      },
    },
    rateLimit: { enabled: env.AUTH_RATE_LIMIT === "on" },
    session: {
      expiresIn: 60 * 60 * 24 * 90, // 90 Tage: WG-App bleibt auf dem Handy eingeloggt
      updateAge: 60 * 60 * 24,
    },
    plugins: [username(), nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

/** Erst beim ersten Zugriff erzeugt, siehe getDb(). */
export function getAuth(): Auth {
  return (instance ??= createAuth());
}

export async function getSession() {
  // headers() zuerst: beim Prerendern bricht Next hier ab, bevor die
  // Datenbank geöffnet wird.
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
}
