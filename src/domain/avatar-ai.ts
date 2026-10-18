import { tileKey, type Tile } from "./grid";
import { findPath, standSpots, type WalkGrid } from "./walk";

/**
 * Idle-Verhalten wie bei den Sims (Spez. 12.5): Avatare laufen herum,
 * bleiben an Objekten stehen (Sofa, Kühlschrank, Pflanze …) und zeigen
 * Gedankenblasen. Bei einer Erledigung läuft der Avatar zum Objekt und putzt.
 * Reine Logik ohne Rendering, deterministisch über einen Zufallsgenerator.
 */

export type Rng = () => number;

/** Kleiner deterministischer Zufallsgenerator (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Interactable = { id: string; type: string; footprint: Tile[] };

export type AvatarMode = "idle" | "walk" | "activity" | "clean";

export type AvatarState = {
  /** Position in Kacheleinheiten (Kachelmitte = x + 0,5). */
  x: number;
  y: number;
  path: Tile[];
  mode: AvatarMode;
  /** Restdauer der aktuellen Pause/Aktivität in Sekunden. */
  timer: number;
  emoji: string | null;
  /** Was nach dem Ankommen passiert. */
  next: {
    mode: "activity" | "clean";
    emoji: string;
    objectId: string | null;
    duration: number;
  } | null;
  facing: 1 | -1;
  /** Objekt, an dem gerade geputzt wird (für den Sparkle danach). */
  objectId: string | null;
};

export const WALK_SPEED = 1.8; // Kacheln pro Sekunde

/** Gedankenblase je Objekttyp beim Herumstehen. */
const ACTIVITY: Record<string, string[]> = {
  sofa: ["😌", "📺", "💤"],
  fridge: ["🥪", "🧃", "🍕"],
  plant: ["💧", "🌱"],
  window: ["🌤️", "🐦"],
  dining_table: ["🍝", "☕"],
  table: ["☕", "💻"],
  stove: ["🍳"],
  washing_machine: ["🧺"],
  mailbox: ["✉️"],
};

/** Putz-Emoji je Objekttyp bei einer Erledigung. */
export function cleaningEmoji(type: string): string {
  if (type.startsWith("trash_")) return "🗑️";
  if (type === "floor") return "🧹";
  if (type === "plant") return "💧";
  if (["pantry", "fridge"].includes(type)) return "🧽";
  return "🧽";
}

export function initialAvatar(start: Tile): AvatarState {
  return {
    x: start[0] + 0.5,
    y: start[1] + 0.5,
    path: [],
    mode: "idle",
    timer: 0.5,
    emoji: null,
    next: null,
    facing: 1,
    objectId: null,
  };
}

export function currentTile(a: AvatarState): Tile {
  return [Math.floor(a.x), Math.floor(a.y)];
}

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

/** Wählt ein neues Ziel: meist ein Objekt mit Aktivität, sonst eine freie Kachel. */
export function chooseIdleGoal(
  a: AvatarState,
  grid: WalkGrid,
  objects: readonly Interactable[],
  rng: Rng,
): AvatarState {
  const from = currentTile(a);
  const fun = objects.filter((o) => ACTIVITY[o.type]);
  if (fun.length && rng() < 0.55) {
    const o = pick(fun, rng);
    const spots = standSpots(grid, o.footprint);
    if (spots.length) {
      const path = findPath(grid, from, pick(spots, rng));
      if (path) {
        return {
          ...a,
          mode: path.length ? "walk" : "activity",
          path,
          emoji: null,
          timer: path.length ? 0 : 3,
          next: {
            mode: "activity",
            emoji: pick(ACTIVITY[o.type], rng),
            objectId: o.id,
            duration: 3 + rng() * 3,
          },
        };
      }
    }
  }
  if (grid.tiles.length) {
    const goal = pick(grid.tiles, rng);
    const path = findPath(grid, from, goal);
    if (path && path.length) {
      return { ...a, mode: "walk", path, emoji: null, next: null };
    }
  }
  return { ...a, mode: "idle", timer: 1 + rng() * 2, emoji: null, next: null };
}

/** Schickt den Avatar zum Putzen an ein Objekt (Spez. 5.5/12.5). */
export function sendToClean(
  a: AvatarState,
  grid: WalkGrid,
  object: Interactable,
): AvatarState {
  const from = currentTile(a);
  const spots = standSpots(grid, object.footprint);
  const target =
    spots.find((s) => tileKey(s[0], s[1]) === tileKey(from[0], from[1])) ??
    spots
      .map((s) => ({ s, path: findPath(grid, from, s) }))
      .filter((c) => c.path)
      .sort((p, q) => p.path!.length - q.path!.length)[0]?.s;
  const next = {
    mode: "clean" as const,
    emoji: cleaningEmoji(object.type),
    objectId: object.id,
    duration: 1.6,
  };
  if (!target) {
    // Kein Weg: direkt an Ort und Stelle „putzen“.
    return {
      ...a,
      mode: "clean",
      timer: next.duration,
      emoji: next.emoji,
      objectId: object.id,
      path: [],
      next: null,
    };
  }
  const path = findPath(grid, from, target) ?? [];
  return {
    ...a,
    mode: path.length ? "walk" : "clean",
    path,
    timer: path.length ? 0 : next.duration,
    emoji: path.length ? null : next.emoji,
    objectId: path.length ? null : object.id,
    next: path.length ? next : null,
  };
}

export type StepEvent = { kind: "cleaned"; objectId: string } | null;

/** Ein Simulationsschritt über dt Sekunden. */
export function stepAvatar(
  a: AvatarState,
  dt: number,
  grid: WalkGrid,
  objects: readonly Interactable[],
  rng: Rng,
): { state: AvatarState; event: StepEvent } {
  if (a.mode === "walk") {
    let { x, y, facing } = a;
    const path = [...a.path];
    let budget = WALK_SPEED * dt;
    while (budget > 0 && path.length) {
      const [tx, ty] = path[0];
      const gx = tx + 0.5;
      const gy = ty + 0.5;
      const dx = gx - x;
      const dy = gy - y;
      const dist = Math.hypot(dx, dy);
      if (dx - dy !== 0) facing = dx - dy > 0 ? 1 : -1;
      if (dist <= budget) {
        x = gx;
        y = gy;
        budget -= dist;
        path.shift();
      } else {
        x += (dx / dist) * budget;
        y += (dy / dist) * budget;
        budget = 0;
      }
    }
    if (path.length)
      return { state: { ...a, x, y, facing, path }, event: null };
    const next = a.next;
    if (!next) {
      return {
        state: {
          ...a,
          x,
          y,
          facing,
          path,
          mode: "idle",
          timer: 0.5 + rng() * 2,
        },
        event: null,
      };
    }
    return {
      state: {
        ...a,
        x,
        y,
        facing,
        path,
        mode: next.mode,
        timer: next.duration,
        emoji: next.emoji,
        objectId: next.objectId,
        next: null,
      },
      event: null,
    };
  }

  const timer = a.timer - dt;
  if (timer > 0) return { state: { ...a, timer }, event: null };

  if (a.mode === "clean" && a.objectId) {
    return {
      state: { ...a, mode: "idle", timer: 1.5, emoji: "✨", objectId: null },
      event: { kind: "cleaned", objectId: a.objectId },
    };
  }
  if (a.mode === "activity" || (a.mode === "idle" && a.emoji)) {
    return {
      state: {
        ...a,
        mode: "idle",
        timer: 1 + rng() * 2,
        emoji: null,
        objectId: null,
      },
      event: null,
    };
  }
  return { state: chooseIdleGoal(a, grid, objects, rng), event: null };
}
