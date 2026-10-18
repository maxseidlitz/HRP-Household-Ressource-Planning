import Link from "next/link";
import { parseAvatar } from "@/catalog/avatar";
import { Avatar } from "@/components/avatar";
import { StarIcon } from "@/components/icons";
import { FeedbackLink } from "@/components/feedback-link";
import { HouseholdPrompts } from "@/components/household-prompts";
import { LogoutButton } from "@/components/logout-button";
import { MenuDetails } from "@/components/menu-details";
import {
  NotificationBell,
  OtherHouseholdsDot,
} from "@/components/notification-bell";
import { TabBar } from "@/components/tab-bar";
import { formatPoints } from "@/domain/points";
import { switchHouseholdAction } from "@/server/actions/household";
import { requireHousehold } from "@/server/context";
import { unreadCounts } from "@/server/queries/notifications";
import { householdLeaderboard } from "@/server/queries/tasks";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireHousehold();
  const myPoints =
    householdLeaderboard(ctx.db, {
      householdId: ctx.household.id,
      period: "month",
      now: new Date(),
    }).find((e) => e.userId === ctx.user.id)?.points ?? 0;
  const avatar = parseAvatar(ctx.user.avatarJson, ctx.user.id);
  const unread = unreadCounts(ctx.db, {
    userId: ctx.user.id,
    householdId: ctx.household.id,
  });

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-white/60 bg-white/55 backdrop-blur-2xl backdrop-saturate-200">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-2.5">
          <Link href="/aufgaben" className="min-w-0 flex-1">
            <span className="block truncate text-[17px] font-semibold">
              {ctx.household.emoji ? `${ctx.household.emoji} ` : ""}
              {ctx.household.name}
            </span>
          </Link>
          <span
            className="glass flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums"
            title="Deine Punkte in diesem Monat"
            data-testid="my-points"
          >
            <StarIcon width={14} height={14} className="text-status-soon" />
            {formatPoints(myPoints)}
          </span>
          <NotificationBell initial={unread} />
          <MenuDetails className="relative">
            <summary
              className="glass relative flex cursor-pointer list-none items-center rounded-full p-0.5 [&::-webkit-details-marker]:hidden"
              aria-label="Profilmenü"
            >
              <Avatar config={avatar} size={28} title={ctx.user.name} />
              <OtherHouseholdsDot initial={unread} />
              {ctx.households.length > 1 && (
                <span className="sr-only">WG wechseln</span>
              )}
            </summary>
            <div className="glass-strong absolute right-0 z-30 mt-2 w-64 rounded-2xl p-2">
              <p className="px-2.5 pb-1 text-xs font-medium text-ink/50">
                Deine WGs
              </p>
              <ul className="mb-2">
                {ctx.households.map((h) => (
                  <li key={h.id}>
                    <form action={switchHouseholdAction}>
                      <input type="hidden" name="householdId" value={h.id} />
                      <button
                        className={`w-full rounded-xl px-2.5 py-2 text-left text-sm ${h.id === ctx.household.id ? "bg-sage/10 font-semibold text-sage-dark" : "hover:bg-black/5"}`}
                        aria-current={
                          h.id === ctx.household.id ? "true" : undefined
                        }
                      >
                        {h.emoji ?? "🏠"} {h.name}
                        {h.role === "admin" && (
                          <span className="ml-1 text-xs text-ink/60">
                            · Admin
                          </span>
                        )}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col border-t border-black/10 pt-2 text-sm">
                <Link
                  href="/setup?neu=1"
                  className="rounded-xl px-2.5 py-2 hover:bg-black/5"
                >
                  Neue WG erstellen
                </Link>
                <Link
                  href="/profil"
                  className="rounded-xl px-2.5 py-2 hover:bg-black/5"
                >
                  Profil
                </Link>
                <Link
                  href="/urlaub"
                  className="rounded-xl px-2.5 py-2 hover:bg-black/5"
                >
                  Urlaub
                </Link>
                <FeedbackLink className="rounded-xl px-2.5 py-2 hover:bg-black/5" />
                <LogoutButton className="rounded-xl px-2.5 py-2 text-left hover:bg-black/5" />
              </div>
            </div>
          </MenuDetails>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-5 pb-32">
        <HouseholdPrompts
          db={ctx.db}
          householdId={ctx.household.id}
          viewerId={ctx.user.id}
        />
        {children}
      </main>
      <TabBar isAdmin={ctx.isAdmin} />
    </>
  );
}
