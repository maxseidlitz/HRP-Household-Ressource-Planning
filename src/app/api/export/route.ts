import { requireAdmin } from "@/server/context";
import { track } from "@/server/queries/analytics";
import { exportHousehold } from "@/server/queries/export";

/** Datenexport als JSON-Datei (Spez. 9.3). */
export async function GET() {
  const ctx = await requireAdmin();
  const now = new Date();
  const data = exportHousehold(ctx.db, {
    householdId: ctx.household.id,
    actorId: ctx.user.id,
    now,
  });
  track(ctx.db, {
    name: "export",
    householdId: ctx.household.id,
    userId: ctx.user.id,
  });
  const date = now.toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="hrp-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
