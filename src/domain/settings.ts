import { z } from "zod";

/** Globale WG-Einstellungen (household.settings_json), Spez. 5.1, 6.1, 9.3. */
export const householdSettingsSchema = z.object({
  /** Ende der Phase „zu früh“ / Beginn Sweet Spot. */
  earlyThreshold: z.number().min(0).max(1).default(0.4),
  /** Ende des Sweet Spots / Beginn „überfällig“. */
  lateThreshold: z.number().min(0.5).max(3).default(1),
  /** Darunter gibt es 0 Punkte. */
  minProgress: z.number().min(0).max(1).default(0.15),
  objectionsEnabled: z.boolean().default(false),
  /** Wie die Widerspruchsfunktion eingeschaltet wurde (Spez. 6.3). */
  objectionsEnabledBy: z.enum(["vote", "admin"]).nullable().default(null),
  icsAlarmMinutes: z.number().int().min(0).default(120),
});

export type HouseholdSettings = z.infer<typeof householdSettingsSchema>;

export function parseSettings(
  json: string | null | undefined,
): HouseholdSettings {
  let raw: unknown = {};
  try {
    raw = json ? JSON.parse(json) : {};
  } catch {
    raw = {};
  }
  const parsed = householdSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : householdSettingsSchema.parse({});
}

export type Thresholds = Pick<
  HouseholdSettings,
  "earlyThreshold" | "lateThreshold" | "minProgress"
>;

/** Aufgabenspezifische Überschreibungen gewinnen gegen globale Werte. */
export function resolveThresholds(
  settings: Thresholds,
  task: {
    earlyThreshold: number | null;
    lateThreshold: number | null;
    minProgress: number | null;
  },
): Thresholds {
  return {
    earlyThreshold: task.earlyThreshold ?? settings.earlyThreshold,
    lateThreshold: task.lateThreshold ?? settings.lateThreshold,
    minProgress: task.minProgress ?? settings.minProgress,
  };
}
