import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { user } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { listHouseholdsOf } from "@/server/queries/households";
import { unreadCounts } from "@/server/queries/notifications";

export const dynamic = "force-dynamic";

/** Ungelesene Mitteilungen für Glocke und Profilbild (Spez. 8, Polling). */
export async function GET() {
  const session = await getSession();
  if (!session)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = getDb();
  const u = db
    .select({ lastHouseholdId: user.lastHouseholdId })
    .from(user)
    .where(eq(user.id, session.user.id))
    .get();
  // Gleiche Auswahl wie requireHousehold: zuletzt gewählte, sonst die erste.
  const households = listHouseholdsOf(db, session.user.id);
  const current =
    households.find((h) => h.id === u?.lastHouseholdId) ?? households[0];
  const counts = unreadCounts(db, {
    userId: session.user.id,
    householdId: current?.id ?? "",
  });
  return Response.json(counts, { headers: { "Cache-Control": "no-store" } });
}
