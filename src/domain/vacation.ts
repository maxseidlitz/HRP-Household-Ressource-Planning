/** Urlaubsvorbereitung (Spez. 7): 1 + 4 = 5 Punkte. */
export const VACATION_POINTS = { fridge: 1, vacuumTrash: 4 } as const;

export type LinkCandidate = {
  id: string;
  name: string;
  objectType: string;
  isPrivate: boolean;
};

/**
 * Standard für „Saugen + Müll“, solange der Admin nichts festgelegt hat:
 * Restmüll, Biomüll und alle Saugen-Aufgaben in Gemeinschaftsräumen.
 */
export function defaultLinkedTasks(tasks: readonly LinkCandidate[]): string[] {
  return tasks
    .filter(
      (t) =>
        !t.isPrivate &&
        (t.objectType === "trash_rest" ||
          t.objectType === "trash_bio" ||
          /saug/i.test(t.name)),
    )
    .map((t) => t.id);
}

export function isAway(
  absences: readonly { from: Date; to: Date }[],
  now: Date,
): boolean {
  return absences.some((a) => a.from <= now && now < a.to);
}
