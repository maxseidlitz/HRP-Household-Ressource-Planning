import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Alle Zeitpunkte werden als UTC-Millisekunden gespeichert. Die Darstellung
// erfolgt in der Zeitzone des Haushalts (households.timezone).
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
const createdAt = () =>
  timestamp("created_at")
    .notNull()
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`);
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

// ---------------------------------------------------------------------------
// Auth (Better Auth). Feldnamen entsprechen dem Better-Auth-Schema inkl.
// Username-Plugin; zusätzliche Felder sind in src/lib/auth.ts registriert.
// ---------------------------------------------------------------------------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  /** Avatar-Konfiguration (Hautton, Frisur, Farben, Accessoire). */
  avatarJson: text("avatar_json"),
  /** Zuletzt gewählte WG für den WG-Wechsler. */
  lastHouseholdId: text("last_household_id"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Haushalt & Mitgliedschaft
// ---------------------------------------------------------------------------

export const household = sqliteTable("household", {
  id: id(),
  name: text("name").notNull(),
  emoji: text("emoji"),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id),
  expectedMemberCount: integer("expected_member_count").notNull().default(1),
  timezone: text("timezone").notNull().default("Europe/Berlin"),
  /** Typisiert über HouseholdSettings (Schwellen, Widerspruch, ICS-Alarm …). */
  settingsJson: text("settings_json").notNull().default("{}"),
  createdAt: createdAt(),
});

export const membership = sqliteTable(
  "membership",
  {
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["admin", "member"] }).notNull(),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] })],
);

export const invite = sqliteTable("invite", {
  id: id(),
  householdId: text("household_id")
    .notNull()
    .references(() => household.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id),
  expiresAt: timestamp("expires_at").notNull(),
  /** null = beliebig oft nutzbar, 1 = Einmal-Link. */
  maxUses: integer("max_uses"),
  uses: integer("uses").notNull().default(0),
  revokedAt: timestamp("revoked_at"),
  createdAt: createdAt(),
});

/** Vom Admin erzeugter Reset-Link (kein Mailversand im Heimnetz). */
export const passwordReset = sqliteTable("password_reset", {
  id: id(),
  householdId: text("household_id")
    .notNull()
    .references(() => household.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Wohnungsplan
// ---------------------------------------------------------------------------

export const ROOM_TYPES = [
  "kitchen",
  "bath",
  "wc",
  "hallway",
  "living",
  "bedroom",
  "balcony",
  "storage",
  "other",
] as const;

export const room = sqliteTable(
  "room",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    type: text("type", { enum: ROOM_TYPES }).notNull(),
    name: text("name").notNull(),
    /**
     * Gesetzt = privates Zimmer. Inhalt ist nur für diese Person sichtbar,
     * alle anderen (auch Admins) sehen nur den Umriss.
     */
    privateOwnerId: text("private_owner_id").references(() => user.id, {
      onDelete: "set null",
    }),
    /** Unterraum innerhalb eines privaten Zimmers (z. B. eigenes Bad). */
    parentRoomId: text("parent_room_id"),
    /** Liste belegter Rasterkacheln [[x, y], …] in globalen Koordinaten. */
    tilesJson: text("tiles_json").notNull().default("[]"),
    /** Türen auf Wandsegmenten [{ x, y, side }]. */
    doorsJson: text("doors_json").notNull().default("[]"),
    createdAt: createdAt(),
  },
  (t) => [index("room_household_idx").on(t.householdId)],
);

export const objectGroup = sqliteTable("object_group", {
  id: id(),
  roomId: text("room_id")
    .notNull()
    .references(() => room.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
});

export const householdObject = sqliteTable(
  "object",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    roomId: text("room_id")
      .notNull()
      .references(() => room.id, { onDelete: "cascade" }),
    groupId: text("group_id").references(() => objectGroup.id, {
      onDelete: "set null",
    }),
    /** Typ aus der Objektbibliothek, z. B. "toilet", "trash_bio", "floor". */
    type: text("type").notNull(),
    name: text("name").notNull(),
    x: integer("x").notNull().default(0),
    y: integer("y").notNull().default(0),
    w: integer("w").notNull().default(1),
    h: integer("h").notNull().default(1),
    rotation: integer("rotation").notNull().default(0),
    /** Erst platzierte Objekte erscheinen im Wohnungsplan. */
    placed: integer("placed", { mode: "boolean" }).notNull().default(false),
    /** Implizites Boden-Objekt eines Raums (als Bodentönung gerendert). */
    isFloor: integer("is_floor", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("object_room_idx").on(t.roomId)],
);

// ---------------------------------------------------------------------------
// Aufgaben & Erledigungen
// ---------------------------------------------------------------------------

export const task = sqliteTable(
  "task",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    objectId: text("object_id")
      .notNull()
      .references(() => householdObject.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    intervalDays: real("interval_days").notNull(),
    multiplier: real("multiplier").notNull().default(1),
    /** Überschreibungen der globalen Schwellen (null = globaler Wert). */
    earlyThreshold: real("early_threshold"),
    lateThreshold: real("late_threshold"),
    minProgress: real("min_progress"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    pausedAt: timestamp("paused_at"),
    /**
     * Startpunkt der Zählung, solange keine spätere gültige Erledigung
     * existiert. Gesetzt bei Anlage („zuletzt gemacht?“) und Reaktivierung.
     */
    baselineAt: timestamp("baseline_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("task_object_idx").on(t.objectId)],
);

export const completion = sqliteTable(
  "completion",
  {
    id: id(),
    taskId: text("task_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    completedAt: timestamp("completed_at").notNull(),
    progressAtCompletion: real("progress_at_completion").notNull(),
    points: real("points").notNull(),
    status: text("status", { enum: ["valid", "contested", "revoked"] })
      .notNull()
      .default("valid"),
    source: text("source", { enum: ["manual", "vacation"] })
      .notNull()
      .default("manual"),
    /** Schutz gegen Doppel-Taps / doppelt gesendete Formulare. */
    idempotencyKey: text("idempotency_key").unique(),
  },
  (t) => [index("completion_task_idx").on(t.taskId, t.completedAt)],
);

export const commitment = sqliteTable(
  "commitment",
  {
    id: id(),
    taskId: text("task_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    plannedFor: timestamp("planned_for").notNull(),
    status: text("status", {
      enum: ["open", "fulfilled", "missed", "cancelled"],
    })
      .notNull()
      .default("open"),
    createdAt: createdAt(),
  },
  (t) => [
    // Pro Aufgabe höchstens eine offene Einplanung.
    uniqueIndex("commitment_open_unique")
      .on(t.taskId)
      .where(sql`status = 'open'`),
  ],
);

// ---------------------------------------------------------------------------
// Urlaub
// ---------------------------------------------------------------------------

/** Abwesenheit gilt personenbezogen für alle WGs eines Accounts. */
export const absence = sqliteTable("absence", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  from: timestamp("from").notNull(),
  to: timestamp("to").notNull(),
  createdAt: createdAt(),
});

export const vacationBundle = sqliteTable("vacation_bundle", {
  id: id(),
  absenceId: text("absence_id")
    .notNull()
    .references(() => absence.id, { onDelete: "cascade" }),
  householdId: text("household_id")
    .notNull()
    .references(() => household.id, { onDelete: "cascade" }),
  fridgeDoneAt: timestamp("fridge_done_at"),
  vacuumTrashDoneAt: timestamp("vacuum_trash_done_at"),
  points: real("points").notNull().default(0),
});

/** Reguläre Aufgaben, die das Urlaubspaket „Saugen + Müll“ zurücksetzt. */
export const vacationLinkedTask = sqliteTable(
  "vacation_linked_task",
  {
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.taskId] })],
);

// ---------------------------------------------------------------------------
// Widerspruch & Abstimmungen
// ---------------------------------------------------------------------------

export const objection = sqliteTable("objection", {
  id: id(),
  completionId: text("completion_id")
    .notNull()
    .unique()
    .references(() => completion.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id),
  deadlineAt: timestamp("deadline_at").notNull(),
  resolvedAt: timestamp("resolved_at"),
  resolution: text("resolution", { enum: ["valid", "revoked"] }),
  createdAt: createdAt(),
});

export const objectionVote = sqliteTable(
  "objection_vote",
  {
    objectionId: text("objection_id")
      .notNull()
      .references(() => objection.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vote: text("vote", { enum: ["confirm", "reject"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.objectionId, t.userId] })],
);

export const featureVote = sqliteTable(
  "feature_vote",
  {
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    feature: text("feature").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vote: integer("vote", { mode: "boolean" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.feature, t.userId] })],
);

// ---------------------------------------------------------------------------
// Mitteilungen, Feedback, Analytics
// ---------------------------------------------------------------------------

export const notification = sqliteTable(
  "notification",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    householdId: text("household_id").references(() => household.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    /** Verhindert, dass der Scheduler dieselbe Meldung mehrfach erzeugt. */
    dedupeKey: text("dedupe_key").unique(),
    readAt: timestamp("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notification_user_idx").on(t.userId, t.readAt)],
);

export const feedbackTicket = sqliteTable("feedback_ticket", {
  id: id(),
  householdId: text("household_id")
    .notNull()
    .references(() => household.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  category: text("category", { enum: ["bug", "idea", "other"] }).notNull(),
  text: text("text").notNull(),
  screenshotPath: text("screenshot_path"),
  contextJson: text("context_json").notNull().default("{}"),
  status: text("status", { enum: ["new", "in_progress", "done", "rejected"] })
    .notNull()
    .default("new"),
  adminNote: text("admin_note"),
  adminReply: text("admin_reply"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at"),
});

export const analyticsEvent = sqliteTable(
  "analytics_event",
  {
    id: id(),
    householdId: text("household_id").references(() => household.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    screen: text("screen"),
    metaJson: text("meta_json").notNull().default("{}"),
    createdAt: createdAt(),
  },
  (t) => [index("analytics_household_idx").on(t.householdId, t.createdAt)],
);
