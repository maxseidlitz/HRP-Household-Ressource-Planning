import Link from "next/link";
import { parseAvatar } from "@/catalog/avatar";
import { Avatar } from "@/components/avatar";
import { LogoutButton } from "@/components/logout-button";
import { TabBar } from "@/components/tab-bar";
import { formatPoints } from "@/domain/points";
import { switchHouseholdAction } from "@/server/actions/household";
import { requireHousehold } from "@/server/context";
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

  return (
    <>
      <header className="sticky top-0 z-20 border-b-2 border-ink bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-2.5">
          <Link href="/aufgaben" className="min-w-0 flex-1">
            <span className="block truncate text-lg font-bold">
              {ctx.household.emoji ? `${ctx.household.emoji} ` : ""}
              {ctx.household.name}
            </span>
          </Link>
          <span
            className="rounded-full border-2 border-ink bg-status-sweet/60 px-2.5 py-0.5 text-sm font-bold"
            title="Deine Punkte in diesem Monat"
            data-testid="my-points"
          >
            ⭐ {formatPoints(myPoints)}
          </span>
          <details className="relative">
            <summary
              className="flex cursor-pointer list-none items-center rounded-full border-2 border-ink bg-white p-0.5 [&::-webkit-details-marker]:hidden"
              aria-label="Profilmenü"
            >
              <Avatar config={avatar} size={28} title={ctx.user.name} />
              {ctx.households.length > 1 && (
                <span className="sr-only">WG wechseln</span>
              )}
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border-2 border-ink bg-cream p-2 shadow-[0_4px_0_0_var(--ink)]">
              <p className="px-2 pb-1 text-xs font-semibold text-ink/60">
                Deine WGs
              </p>
              <ul className="mb-2">
                {ctx.households.map((h) => (
                  <li key={h.id}>
                    <form action={switchHouseholdAction}>
                      <input type="hidden" name="householdId" value={h.id} />
                      <button
                        className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${h.id === ctx.household.id ? "bg-sage/40 font-bold" : "hover:bg-cream-dark"}`}
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
              <div className="flex flex-col border-t border-ink/20 pt-2 text-sm">
                <Link
                  href="/setup?neu=1"
                  className="rounded-lg px-2 py-1.5 hover:bg-cream-dark"
                >
                  ➕ Neue WG erstellen
                </Link>
                <Link
                  href="/profil"
                  className="rounded-lg px-2 py-1.5 hover:bg-cream-dark"
                >
                  🙂 Profil
                </Link>
                <LogoutButton className="rounded-lg px-2 py-1.5 text-left hover:bg-cream-dark" />
              </div>
            </div>
          </details>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-4 pb-28">
        {children}
      </main>
      <TabBar isAdmin={ctx.isAdmin} />
    </>
  );
}
