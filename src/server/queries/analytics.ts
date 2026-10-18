import type { DB } from "@/db/client";
import { analyticsEvent } from "@/db/schema";

/** Eigene Event-Tabelle für die Admin-Statistik (Spez. 9.1). */
export function track(
  db: DB,
  input: {
    name: string;
    householdId?: string | null;
    userId?: string | null;
    screen?: string;
    meta?: Record<string, unknown>;
  },
) {
  try {
    db.insert(analyticsEvent)
      .values({
        name: input.name,
        householdId: input.householdId ?? null,
        userId: input.userId ?? null,
        screen: input.screen ?? null,
        metaJson: JSON.stringify(input.meta ?? {}),
      })
      .run();
  } catch (e) {
    // Statistik darf nie eine Nutzeraktion scheitern lassen.
    console.error("analytics", e);
  }
}
