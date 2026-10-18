import Link from "next/link";
import { PlanEditor } from "@/components/plan/plan-editor";
import { requireHousehold } from "@/server/context";
import { getPlan } from "@/server/queries/plan";

export default async function PlanEditPage({
  searchParams,
}: PageProps<"/plan/bearbeiten">) {
  const ctx = await requireHousehold();
  const { raum } = await searchParams;
  const plan = getPlan(ctx.db, {
    householdId: ctx.household.id,
    viewerId: ctx.user.id,
    now: new Date(),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Link href="/wohnung" className="text-sm font-semibold text-ink/70">
          ← Wohnung
        </Link>
        {ctx.isAdmin && (
          <Link
            href="/verwaltung/wohnung"
            className="text-sm font-semibold underline"
          >
            + Raum anlegen
          </Link>
        )}
      </div>
      <h1 className="text-2xl font-bold">Plan bearbeiten</h1>
      <PlanEditor
        plan={plan}
        initialRoomId={typeof raum === "string" ? raum : undefined}
      />
    </div>
  );
}
