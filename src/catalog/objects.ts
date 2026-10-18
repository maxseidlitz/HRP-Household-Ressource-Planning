import type { RoomType } from "./rooms";

/** Aufgabenvorschlag (Spez. 5.4). */
export type TaskSuggestion = {
  name: string;
  intervalDays: number;
  multiplier: number;
};

export type ObjectDefinition = {
  type: string;
  name: string;
  emoji: string;
  /** Grundfläche in Kacheln (für den Plan ab Phase 1b). */
  w: number;
  h: number;
  /** Räume, in denen das Objekt in der Bibliothek zuerst angeboten wird. */
  rooms: RoomType[];
  suggestions: TaskSuggestion[];
};

const KITCHEN: RoomType[] = ["kitchen"];
const BATH: RoomType[] = ["bath", "wc"];
const ANY: RoomType[] = [];

/** Objektbibliothek v1 (Spez. 4.3). */
export const OBJECTS: ObjectDefinition[] = [
  // Küche
  {
    type: "stove",
    name: "Herd",
    emoji: "🔥",
    w: 2,
    h: 2,
    rooms: KITCHEN,
    suggestions: [{ name: "Herd reinigen", intervalDays: 7, multiplier: 1 }],
  },
  {
    type: "oven",
    name: "Ofen",
    emoji: "♨️",
    w: 2,
    h: 2,
    rooms: KITCHEN,
    suggestions: [{ name: "Ofen reinigen", intervalDays: 60, multiplier: 2 }],
  },
  {
    type: "counter",
    name: "Arbeitsplatte",
    emoji: "🔪",
    w: 3,
    h: 2,
    rooms: KITCHEN,
    suggestions: [
      { name: "Arbeitsplatte abwischen", intervalDays: 3, multiplier: 0.5 },
    ],
  },
  {
    type: "sink",
    name: "Spüle",
    emoji: "🚰",
    w: 2,
    h: 2,
    rooms: KITCHEN,
    suggestions: [{ name: "Spüle reinigen", intervalDays: 7, multiplier: 0.5 }],
  },
  {
    type: "dishwasher",
    name: "Geschirrspüler",
    emoji: "🍽️",
    w: 2,
    h: 2,
    rooms: KITCHEN,
    suggestions: [{ name: "Ausräumen", intervalDays: 2, multiplier: 0.5 }],
  },
  {
    type: "fridge",
    name: "Kühlschrank",
    emoji: "🧊",
    w: 2,
    h: 2,
    rooms: KITCHEN,
    suggestions: [
      { name: "Kühlschrank auswischen", intervalDays: 30, multiplier: 2 },
    ],
  },
  {
    type: "trash_rest",
    name: "Restmüll",
    emoji: "🗑️",
    w: 1,
    h: 1,
    rooms: KITCHEN,
    suggestions: [
      { name: "Restmüll rausbringen", intervalDays: 3, multiplier: 0.5 },
    ],
  },
  {
    type: "trash_bio",
    name: "Biomüll",
    emoji: "🍂",
    w: 1,
    h: 1,
    rooms: KITCHEN,
    suggestions: [
      { name: "Biomüll rausbringen", intervalDays: 3, multiplier: 0.5 },
    ],
  },
  {
    type: "trash_yellow",
    name: "Gelber Sack",
    emoji: "♻️",
    w: 1,
    h: 1,
    rooms: KITCHEN,
    suggestions: [
      { name: "Gelben Sack rausbringen", intervalDays: 7, multiplier: 0.5 },
    ],
  },
  {
    type: "trash_paper",
    name: "Altpapier",
    emoji: "📰",
    w: 1,
    h: 1,
    rooms: KITCHEN,
    suggestions: [
      { name: "Altpapier wegbringen", intervalDays: 14, multiplier: 0.5 },
    ],
  },
  {
    type: "trash_glass",
    name: "Altglas",
    emoji: "🍾",
    w: 1,
    h: 1,
    rooms: KITCHEN,
    suggestions: [
      { name: "Altglas wegbringen", intervalDays: 30, multiplier: 1 },
    ],
  },
  {
    type: "dining_table",
    name: "Esstisch",
    emoji: "🪑",
    w: 3,
    h: 2,
    rooms: KITCHEN,
    suggestions: [],
  },
  {
    type: "microwave",
    name: "Mikrowelle",
    emoji: "📟",
    w: 1,
    h: 1,
    rooms: KITCHEN,
    suggestions: [],
  },
  {
    type: "pantry",
    name: "Vorratsschrank",
    emoji: "🥫",
    w: 2,
    h: 1,
    rooms: KITCHEN,
    suggestions: [
      { name: "Klopapier/Spülmittel prüfen", intervalDays: 7, multiplier: 0.5 },
    ],
  },
  // Bad / WC
  {
    type: "toilet",
    name: "Toilette",
    emoji: "🚽",
    w: 1,
    h: 2,
    rooms: BATH,
    suggestions: [{ name: "Klo putzen", intervalDays: 7, multiplier: 1.5 }],
  },
  {
    type: "shower",
    name: "Dusche",
    emoji: "🚿",
    w: 2,
    h: 2,
    rooms: BATH,
    suggestions: [{ name: "Dusche putzen", intervalDays: 7, multiplier: 1.5 }],
  },
  {
    type: "bathtub",
    name: "Badewanne",
    emoji: "🛁",
    w: 4,
    h: 2,
    rooms: BATH,
    suggestions: [],
  },
  {
    type: "washbasin",
    name: "Waschbecken",
    emoji: "🪥",
    w: 2,
    h: 1,
    rooms: BATH,
    suggestions: [
      { name: "Waschbecken + Spiegel", intervalDays: 7, multiplier: 1 },
    ],
  },
  {
    type: "mirror",
    name: "Spiegel",
    emoji: "🪞",
    w: 2,
    h: 1,
    rooms: BATH,
    suggestions: [],
  },
  {
    type: "towel_rail",
    name: "Handtuchhalter",
    emoji: "🧺",
    w: 1,
    h: 1,
    rooms: BATH,
    suggestions: [],
  },
  // Allgemein
  {
    type: "window",
    name: "Fenster",
    emoji: "🪟",
    w: 2,
    h: 1,
    rooms: ANY,
    suggestions: [],
  },
  {
    type: "plant",
    name: "Pflanze",
    emoji: "🪴",
    w: 1,
    h: 1,
    rooms: ANY,
    suggestions: [{ name: "Gießen", intervalDays: 4, multiplier: 0.5 }],
  },
  {
    type: "sofa",
    name: "Sofa",
    emoji: "🛋️",
    w: 4,
    h: 2,
    rooms: ["living"],
    suggestions: [],
  },
  {
    type: "table",
    name: "Tisch",
    emoji: "🪵",
    w: 2,
    h: 2,
    rooms: ANY,
    suggestions: [],
  },
  {
    type: "washing_machine",
    name: "Waschmaschine",
    emoji: "🌀",
    w: 2,
    h: 2,
    rooms: ANY,
    suggestions: [],
  },
  {
    type: "drying_rack",
    name: "Wäscheständer",
    emoji: "👕",
    w: 2,
    h: 1,
    rooms: ANY,
    suggestions: [],
  },
  {
    type: "shoe_rack",
    name: "Schuhregal",
    emoji: "👟",
    w: 2,
    h: 1,
    rooms: ["hallway"],
    suggestions: [],
  },
  {
    type: "mailbox",
    name: "Briefkasten",
    emoji: "📬",
    w: 1,
    h: 1,
    rooms: ["hallway"],
    suggestions: [],
  },
];

/** Implizites Boden-Objekt jedes Raums (Spez. 4.3). */
export const FLOOR: Omit<ObjectDefinition, "suggestions"> = {
  type: "floor",
  name: "Boden",
  emoji: "🧹",
  w: 0,
  h: 0,
  rooms: ANY,
};

export function floorSuggestions(roomType: RoomType): TaskSuggestion[] {
  switch (roomType) {
    case "bath":
    case "wc":
      return [{ name: "Bad wischen", intervalDays: 14, multiplier: 1.5 }];
    case "kitchen":
    case "hallway":
    case "living":
      return [{ name: "Saugen", intervalDays: 7, multiplier: 1 }];
    default:
      return [];
  }
}

const BY_TYPE = new Map(OBJECTS.map((o) => [o.type, o]));

export function objectDefinition(type: string) {
  return type === FLOOR.type
    ? { ...FLOOR, suggestions: [] }
    : BY_TYPE.get(type);
}

export function objectEmoji(type: string): string {
  return objectDefinition(type)?.emoji ?? "📦";
}

export function suggestionsFor(
  type: string,
  roomType: RoomType,
): TaskSuggestion[] {
  return type === FLOOR.type
    ? floorSuggestions(roomType)
    : (BY_TYPE.get(type)?.suggestions ?? []);
}

/** Bibliothek für einen Raum: passende Objekte zuerst. */
export function libraryFor(roomType: RoomType): ObjectDefinition[] {
  const fits = (o: ObjectDefinition) =>
    o.rooms.length === 0 || o.rooms.includes(roomType);
  return [...OBJECTS.filter(fits), ...OBJECTS.filter((o) => !fits(o))];
}
