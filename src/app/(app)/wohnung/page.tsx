import Link from "next/link";
import { parseAvatar } from "@/catalog/avatar";
import { PlanViewer } from "@/components/plan/plan-viewer";
import { listMembers } from "@/server/queries/households";
import { requireHousehold } from "@/server/context";
import { track } from "@/server/queries/analytics";
import { getPlan } from "@/server/queries/plan";

export default async function ApartmentPage() {
  const ctx = await requireHousehold();
  const now = new Date();
  const plan = getPlan(ctx.db, {
    householdId: ctx.household.id,
    viewerId: ctx.user.id,
    now,
  });
  track(ctx.db, {
    name: "screen_view",
    screen: "wohnung",
    householdId: ctx.household.id,
    userId: ctx.user.id,
  });
  const drawn = plan.rooms.some((r) => r.tiles.length > 0);
  const canEditPlan = plan.rooms.some((r) => r.canEditOutline) || ctx.isAdmin;
  const unplaced = plan.objects.filter(
    (o) =>
      !o.placed && plan.rooms.find((r) => r.id === o.roomId)?.canEditContent,
  ).length;
  const undrawn = plan.rooms.filter(
    (r) => r.tiles.length === 0 && r.canEditOutline,
  ).length;

  if (!drawn) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Wohnung</h1>
        <div className="rounded-2xl border-2 border-dashed border-ink/40 p-6 text-center">
          <p className="mb-2 text-4xl">🗺️</p>
          <p className="mb-3 font-semibold">Noch kein Grundriss gezeichnet.</p>
          {ctx.isAdmin ? (
            <Link href="/plan/bearbeiten" className="font-semibold underline">
              Grundriss zeichnen →
            </Link>
          ) : (
            <p className="text-sm text-ink/70">
              Sobald ein Admin den Grundriss zeichnet, siehst du hier eure
              Wohnung. Bis dahin findest du alles unter{" "}
              <Link href="/aufgaben" className="underline">
                Aufgaben
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-48">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Wohnung</h1>
        {canEditPlan && (
          <Link
            href="/plan/bearbeiten"
            className="rounded-xl border-2 border-ink border-b-4 bg-cream px-3 py-1 text-sm font-semibold"
          >
            ✏️ Bearbeiten
          </Link>
        )}
      </div>
      {(unplaced > 0 || undrawn > 0) && (
        <Link
          href="/plan/bearbeiten"
          className="rounded-xl bg-status-sweet/40 px-3 py-2 text-sm"
        >
          {[
            undrawn > 0 &&
              `${undrawn} ${undrawn === 1 ? "Raum" : "Räume"} noch nicht gezeichnet`,
            unplaced > 0 &&
              `${unplaced} ${unplaced === 1 ? "Objekt" : "Objekte"} noch nicht platziert`,
          ]
            .filter(Boolean)
            .join(" · ")}{" "}
          →
        </Link>
      )}
      <PlanViewer
        plan={plan}
        nowIso={now.toISOString()}
        viewerId={ctx.user.id}
        avatars={listMembers(ctx.db, ctx.household.id).map((m) => ({
          userId: m.userId,
          name: m.name,
          avatar: parseAvatar(m.avatarJson, m.userId),
        }))}
      />
    </div>
  );
}
