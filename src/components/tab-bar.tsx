"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/wohnung", label: "Wohnung", icon: "🏠" },
  { href: "/aufgaben", label: "Aufgaben", icon: "🧽" },
  { href: "/rangliste", label: "Rangliste", icon: "🏆" },
  { href: "/profil", label: "Profil", icon: "🙂" },
];

export function TabBar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = isAdmin
    ? [...TABS, { href: "/verwaltung", label: "Admin", icon: "🛠️" }]
    : TABS;
  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink bg-cream-dark pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-xl">
        {tabs.map((t) => {
          const active =
            pathname === t.href ||
            pathname.startsWith(`${t.href}/`) ||
            (t.href === "/verwaltung" && pathname.startsWith("/raum/")) ||
            (t.href === "/wohnung" && pathname.startsWith("/plan/"));
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${active ? "text-ink" : "text-ink/55"}`}
              >
                <span
                  aria-hidden
                  className={`text-xl transition ${active ? "scale-110" : "grayscale-[60%]"}`}
                >
                  {t.icon}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
