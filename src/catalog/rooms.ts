import type { ROOM_TYPES } from "@/db/schema";

export type RoomType = (typeof ROOM_TYPES)[number];

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  kitchen: "Küche",
  bath: "Bad",
  wc: "WC",
  hallway: "Flur",
  living: "Wohnzimmer",
  bedroom: "Zimmer",
  balcony: "Balkon",
  storage: "Abstellraum",
  other: "Sonstiges",
};

export const ROOM_TYPE_EMOJI: Record<RoomType, string> = {
  kitchen: "🍳",
  bath: "🛁",
  wc: "🚽",
  hallway: "🚪",
  living: "🛋️",
  bedroom: "🛏️",
  balcony: "🌿",
  storage: "📦",
  other: "🏠",
};
