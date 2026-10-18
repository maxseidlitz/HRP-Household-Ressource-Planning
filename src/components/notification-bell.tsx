"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

/**
 * Ungelesene Mitteilungen (Spez. 8). Glocke und Profilbild-Punkt teilen sich
 * einen Zähler, der alle 30 s per Polling aktualisiert wird (kein Push im
 * Heimnetz ohne HTTPS).
 */
type Counts = { current: number; other: number };

const POLL_MS = 30_000;
let counts: Counts | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function set(next: Counts) {
  if (counts?.current === next.current && counts?.other === next.other) return;
  counts = next;
  for (const l of listeners) l();
}

/** Nach dem Lesen der Mitteilungen der aktuellen WG. */
export function clearCurrentUnread() {
  set({ current: 0, other: counts?.other ?? 0 });
}

async function poll() {
  if (document.visibilityState !== "visible") return;
  try {
    const res = await fetch("/api/poll", { cache: "no-store" });
    if (res.ok) set((await res.json()) as Counts);
  } catch {
    // Offline: beim nächsten Versuch weiter.
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", poll);
    }
  };
}

function useCounts(initial: Counts): Counts {
  // Neue Server-Daten (z. B. nach dem Lesen) übernehmen.
  useEffect(() => set(initial), [initial.current, initial.other]); // eslint-disable-line react-hooks/exhaustive-deps
  return useSyncExternalStore(
    subscribe,
    () => counts ?? initial,
    () => initial,
  );
}

export function NotificationBell({ initial }: { initial: Counts }) {
  const { current } = useCounts(initial);
  return (
    <Link
      href="/mitteilungen"
      className="relative flex size-9 items-center justify-center rounded-full border-2 border-ink bg-white text-lg"
      aria-label={
        current > 0 ? `Mitteilungen, ${current} ungelesen` : "Mitteilungen"
      }
      data-testid="bell"
    >
      <span aria-hidden>🔔</span>
      {current > 0 && (
        <span
          aria-hidden
          className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full border-2 border-ink bg-status-overdue px-1 text-center text-[11px] leading-4 font-bold text-white"
          data-testid="bell-badge"
        >
          {current > 9 ? "9+" : current}
        </span>
      )}
    </Link>
  );
}

/** Punkt am Profilbild: Neues in einer anderen WG. */
export function OtherHouseholdsDot({ initial }: { initial: Counts }) {
  const { other } = useCounts(initial);
  if (other === 0) return null;
  return (
    <>
      <span
        aria-hidden
        className="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-cream bg-status-overdue"
        data-testid="other-dot"
      />
      <span className="sr-only">Neues in einer anderen WG</span>
    </>
  );
}
