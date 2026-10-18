"use client";

import { usePathname } from "next/navigation";

/** Blendet einen Hinweis auf der Seite aus, auf die er selbst verlinkt. */
export function HideOnPath({
  path,
  children,
}: {
  path: string;
  children: React.ReactNode;
}) {
  return usePathname() === path ? null : children;
}
