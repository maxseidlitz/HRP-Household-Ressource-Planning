import { buildIcs } from "@/domain/ics";
import { appOrigin, requireHousehold } from "@/server/context";
import { track } from "@/server/queries/analytics";
import { getCommitmentForIcs } from "@/server/queries/commitments";

/** Kalendereintrag mit Erinnerung für eine Einplanung (Spez. 5.6). */
export async function GET(
  _req: Request,
  { params }: RouteContext<"/api/ics/[commitmentId]">,
) {
  const { commitmentId } = await params;
  const ctx = await requireHousehold();
  const now = new Date();
  const found = getCommitmentForIcs(ctx.db, {
    householdId: ctx.household.id,
    viewerId: ctx.user.id,
    commitmentId,
    now,
  });
  if (!found) return new Response("Nicht gefunden", { status: 404 });
  const { commitment: c, task: t } = found;
  const origin = await appOrigin();
  const body = buildIcs({
    uid: `${c.id}@hrp`,
    title: `🧽 ${t.name}`,
    description: `${t.roomName} · ${t.objectName}\n${origin}/aufgaben/${t.id}`,
    start: c.plannedFor,
    durationMinutes: 30,
    alarmMinutes: ctx.household.settings.icsAlarmMinutes,
    url: `${origin}/aufgaben/${t.id}`,
    now,
  });
  track(ctx.db, {
    name: "ics_download",
    householdId: ctx.household.id,
    userId: ctx.user.id,
  });
  const filename = `${t.name.replace(/[^\p{L}\p{N}]+/gu, "-")}.ics`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="aufgabe.ics"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
