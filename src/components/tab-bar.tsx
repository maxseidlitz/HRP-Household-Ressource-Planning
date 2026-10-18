"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChecklistIcon,
  GearIcon,
  HomeIcon,
  PersonIcon,
  TrophyIcon,
} from "./icons";

const TABS = [
  { href: "/wohnung", label: "Wohnung", Icon: HomeIcon },
  { href: "/aufgaben", label: "Aufgaben", Icon: ChecklistIcon },
  { href: "/rangliste", label: "Rangliste", Icon: TrophyIcon },
  { href: "/profil", label: "Profil", Icon: PersonIcon },
];

/** Schwebende Tab-Leiste aus Glas (Liquid Glass). */
export function TabBar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = isAdmin
    ? [...TABS, { href: "/verwaltung", label: "Admin", Icon: GearIcon }]
    : TABS;
  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
    >
      <ul className="glass-strong mx-auto flex max-w-md rounded-full p-1">
        {tabs.map(({ href, label, Icon }) => {
          const active =
            pathname === href ||
            pathname.startsWith(`${href}/`) ||
            (href === "/verwaltung" && pathname.startsWith("/raum/")) ||
            (href === "/wohnung" && pathname.startsWith("/plan/"));
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium transition ${active ? "bg-white/80 text-sage shadow-[0_1px_6px_rgb(0_0_0/0.08)]" : "text-ink/55"}`}
              >
                <Icon width={22} height={22} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
