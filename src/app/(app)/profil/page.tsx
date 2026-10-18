import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { parseAvatar } from "@/catalog/avatar";
import { ROOM_TYPE_EMOJI } from "@/catalog/rooms";
import { room } from "@/db/schema";
import { LogoutButton } from "@/components/logout-button";
import { Card } from "@/components/ui";
import { isPlaceholderEmail } from "@/lib/placeholder-email";
import { requireHousehold } from "@/server/context";
import { LeaveHouseholdForm, ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const ctx = await requireHousehold();
  const myRooms = ctx.db
    .select()
    .from(room)
    .where(
      and(
        eq(room.householdId, ctx.household.id),
        eq(room.privateOwnerId, ctx.user.id),
        isNull(room.parentRoomId),
      ),
    )
    .all();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Profil</h1>
      <Card>
        <p className="mb-4 text-sm text-ink/70">
          @{ctx.user.username}
          {!isPlaceholderEmail(ctx.user.email) && ` · ${ctx.user.email}`}
        </p>
        <ProfileForm
          name={ctx.user.name}
          avatar={parseAvatar(ctx.user.avatarJson, ctx.user.id)}
        />
      </Card>

      {myRooms.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Mein Zimmer</h2>
          <ul className="flex flex-col gap-2">
            {myRooms.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/raum/${r.id}`}
                  className="flex items-center gap-3 rounded-xl glass p-3"
                >
                  <span aria-hidden className="text-2xl">
                    {ROOM_TYPE_EMOJI[r.type]}
                  </span>
                  <span className="flex-1 font-semibold">
                    {r.name} einrichten
                  </span>
                  <span aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-bold">WG</h2>
        <p className="text-sm">
          Du bist in{" "}
          {ctx.households.length === 1
            ? "einer WG"
            : `${ctx.households.length} WGs`}
          . Wechseln kannst du über dein Profilbild oben rechts.
        </p>
        <Link href="/setup?neu=1" className="text-sm font-semibold underline">
          Weitere WG erstellen
        </Link>
        {!ctx.isCreator && (
          <LeaveHouseholdForm
            householdId={ctx.household.id}
            name={ctx.household.name}
          />
        )}
      </section>

      <LogoutButton className="self-start rounded-full glass px-4 py-2 font-semibold" />
    </div>
  );
}
