import { redirect } from "next/navigation";
import { BuildMode } from "@/components/build/build-mode";
import { requireHousehold } from "@/server/context";
import { listMembers } from "@/server/queries/households";
import { getPlan } from "@/server/queries/plan";

/**
 * Baumodus: Admins bauen die Wohnung, alle anderen richten ihr eigenes
 * privates Zimmer ein.
 */
export default async function BuildPage({
  searchParams,
}: PageProps<"/plan/bearbeiten">) {
  const ctx = await requireHousehold();
  const { raum } = await searchParams;
  const plan = getPlan(ctx.db, {
    householdId: ctx.household.id,
    viewerId: ctx.user.id,
    now: new Date(),
  });
  const ownsRoom = plan.rooms.some(
    (r) => !r.parentRoomId && r.privateOwnerId === ctx.user.id,
  );
  if (!ctx.isAdmin && !ownsRoom) redirect("/wohnung");
  const members = listMembers(ctx.db, ctx.household.id).map((m) => ({
    id: m.userId,
    name: m.name,
  }));

  return (
    <BuildMode
      plan={plan}
      members={members}
      viewer={{ id: ctx.user.id, isAdmin: ctx.isAdmin }}
      focusRoomId={typeof raum === "string" ? raum : undefined}
    />
  );
}
