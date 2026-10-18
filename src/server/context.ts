import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { user } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { getHousehold, listHouseholdsOf } from "./queries/households";

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  const db = getDb();
  const u = db.select().from(user).where(eq(user.id, session.user.id)).get();
  if (!u) redirect("/login");
  return { db, user: u };
}

/**
 * Aktuelle WG der angemeldeten Person (zuletzt gewählte, sonst die erste).
 * Ohne WG geht es zum Einrichten.
 */
export async function requireHousehold() {
  const { db, user: u } = await requireUser();
  const households = listHouseholdsOf(db, u.id);
  if (households.length === 0) redirect("/setup");
  const current =
    households.find((h) => h.id === u.lastHouseholdId) ?? households[0];
  const household = getHousehold(db, current.id)!;
  return {
    db,
    user: u,
    household,
    households,
    role: current.role,
    isAdmin: current.role === "admin",
    isCreator: household.createdByUserId === u.id,
  };
}

export async function requireAdmin() {
  const ctx = await requireHousehold();
  if (!ctx.isAdmin) redirect("/aufgaben");
  return ctx;
}

/** Basis-URL für Links (Einladung, Reset), passend zur aufgerufenen Adresse. */
export async function appOrigin(): Promise<string> {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  return `${env.APP_PROTOCOL}://${host}`;
}
