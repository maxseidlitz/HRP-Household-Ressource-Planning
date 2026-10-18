import { z } from "zod";

export const SKIN_TONES = [
  "#f5d6c1",
  "#e8b894",
  "#c98e62",
  "#9a6440",
  "#6b4128",
];
export const HAIR_COLORS = [
  "#2b1d14",
  "#6a4022",
  "#c58b3c",
  "#e6c86e",
  "#b23a2b",
  "#7d8590",
];
export const SHIRT_COLORS = [
  "#8fa98a",
  "#7d97ad",
  "#d98c5f",
  "#c9a24b",
  "#a57bb0",
  "#e07a7a",
];
export const HAIR_STYLES = ["short", "long", "bun", "curly", "bald"] as const;
export const ACCESSORIES = ["none", "glasses", "cap", "headphones"] as const;

export const avatarSchema = z.object({
  skin: z
    .number()
    .int()
    .min(0)
    .max(SKIN_TONES.length - 1),
  hair: z.enum(HAIR_STYLES),
  hairColor: z
    .number()
    .int()
    .min(0)
    .max(HAIR_COLORS.length - 1),
  shirt: z
    .number()
    .int()
    .min(0)
    .max(SHIRT_COLORS.length - 1),
  accessory: z.enum(ACCESSORIES),
});

export type AvatarConfig = z.infer<typeof avatarSchema>;

/** Deterministischer Start-Avatar aus der User-ID. */
export function defaultAvatar(seed: string): AvatarConfig {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = (n: number) => {
    const v = h % n;
    h = Math.floor(h / n) + 7;
    return v;
  };
  return {
    skin: pick(SKIN_TONES.length),
    hair: HAIR_STYLES[pick(HAIR_STYLES.length - 1)],
    hairColor: pick(HAIR_COLORS.length),
    shirt: pick(SHIRT_COLORS.length),
    accessory: "none",
  };
}

export function parseAvatar(
  json: string | null | undefined,
  seed: string,
): AvatarConfig {
  if (json) {
    try {
      const parsed = avatarSchema.safeParse(JSON.parse(json));
      if (parsed.success) return parsed.data;
    } catch {
      // ungültig → Standard
    }
  }
  return defaultAvatar(seed);
}
