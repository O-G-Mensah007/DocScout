import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Schema notes:
 *  - `practices` is the roster: who exists. Slow-changing.
 *  - `snapshots` is immutable evidence (invariant 7). Never delete a row.
 *  - `observations` is the append-only status history — the compounding asset.
 *  - `practices.current_*` is a denormalised read cache derived from
 *    observations, so the public map is one indexed query.
 */

export const practiceStatusEnum = pgEnum("practice_status", [
  "accepting",
  "accepting_with_conditions",
  "waitlist_only",
  "not_accepting",
  "unknown",
]);

export const practiceTypeEnum = pgEnum("practice_type", [
  "FHT", "FHO", "FHG", "CHC", "NPLC", "AHAC", "solo", "walk_in", "other",
]);

export const sourceTypeEnum = pgEnum("source_type", [
  "practice_website", "booking_platform", "google_business",
  "intake_form", "phone_call", "practice_submission", "open_data",
]);

export const verificationMethodEnum = pgEnum("verification_method", [
  "automated_extraction", "human_phone", "practice_submission",
]);

export const practices = pgTable(
  "practices",
  {
    id: text("id").primaryKey(), // e.g. on-tor-004821
    name: text("name").notNull(),
    type: practiceTypeEnum("type").notNull().default("other"),

    addressLine1: text("address_line1").notNull(),
    city: text("city").notNull(),
    postal: text("postal").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    catchment: text("catchment").notNull(),

    websiteUrl: text("website_url"),
    bookingUrl: text("booking_url"),
    phone: text("phone"),

    mds: integer("mds"),
    nps: integer("nps"),
    languages: jsonb("languages").$type<string[]>().notNull().default([]),

    // Denormalised current state, derived from observations.
    currentStatus: practiceStatusEnum("current_status").notNull().default("unknown"),
    currentConditions: jsonb("current_conditions").$type<Record<string, unknown> | null>(),
    currentIntakeMethod: text("current_intake_method"),
    currentIntakeUrl: text("current_intake_url"),
    currentEvidenceQuote: text("current_evidence_quote"),
    currentEvidenceUrl: text("current_evidence_url"),
    currentSnapshotId: uuid("current_snapshot_id"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verificationMethod: verificationMethodEnum("verification_method"),
    confidence: doublePrecision("confidence"),
    lastHumanCheck: timestamp("last_human_check", { withTimezone: true }),
    recheckDue: timestamp("recheck_due", { withTimezone: true }),

    // Invariant 6: delisting is a flag, honoured immediately by every read path.
    delistedAt: timestamp("delisted_at", { withTimezone: true }),
    crawlBlocked: boolean("crawl_blocked").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byCatchment: index("practices_catchment_idx").on(t.catchment),
    byStatus: index("practices_status_idx").on(t.currentStatus),
    byRecheck: index("practices_recheck_idx").on(t.recheckDue),
    byPostal: index("practices_postal_idx").on(t.postal),
  }),
);

/** Immutable. Invariant 7. */
export const snapshots = pgTable(
  "snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: text("practice_id").notNull().references(() => practices.id),
    sourceUrl: text("source_url").notNull(),
    sourceType: sourceTypeEnum("source_type").notNull(),
    httpStatus: integer("http_status"),
    contentHash: text("content_hash").notNull(),
    body: text("body").notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byPractice: index("snapshots_practice_idx").on(t.practiceId, t.retrievedAt),
    // Skip re-extraction when a page has not changed since we last read it.
    byHash: index("snapshots_hash_idx").on(t.practiceId, t.contentHash),
  }),
);

/** Append-only. The compounding asset. */
export const observations = pgTable(
  "observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: text("practice_id").notNull().references(() => practices.id),
    status: practiceStatusEnum("status").notNull(),
    conditions: jsonb("conditions").$type<Record<string, unknown> | null>(),
    intakeMethod: text("intake_method"),
    intakeUrl: text("intake_url"),
    evidenceQuote: text("evidence_quote"),
    snapshotId: uuid("snapshot_id").references(() => snapshots.id),
    method: verificationMethodEnum("method").notNull(),
    confidence: doublePrecision("confidence").notNull(),
    model: text("model"),
    reasoning: text("reasoning"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byPractice: index("observations_practice_idx").on(t.practiceId, t.observedAt),
  }),
);

/** The human phone queue — ground truth, and the eval set. */
export const auditTasks = pgTable(
  "audit_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: text("practice_id").notNull().references(() => practices.id),
    // "random" is the only sample that produces an honest precision number.
    reason: text("reason").notNull(), // random | low_confidence | disputed | high_value
    machineStatus: practiceStatusEnum("machine_status"),
    humanStatus: practiceStatusEnum("human_status"),
    agreed: boolean("agreed"),
    notes: text("notes"),
    assignedTo: text("assigned_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    open: index("audit_open_idx").on(t.completedAt),
    byReason: index("audit_reason_idx").on(t.reason),
  }),
);

/**
 * Watches. Invariant 3: postal code and a contact address. Nothing else.
 * No name, no health card, no reason for wanting a doctor.
 */
export const watches = pgTable(
  "watches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    postal: text("postal").notNull(),
    radiusKm: integer("radius_km").notNull().default(10),
    languages: jsonb("languages").$type<string[]>().notNull().default([]),
    acceptNp: boolean("accept_np").notNull().default(true),
    acceptConditional: boolean("accept_conditional").notNull().default(true),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    unsubscribeToken: uuid("unsubscribe_token").notNull().defaultRandom(),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byPostal: index("watches_postal_idx").on(t.postal),
    uniqueTarget: uniqueIndex("watches_email_postal_idx").on(t.email, t.postal),
  }),
);

/** Corrections from patients and practices. Routes into the audit queue. */
export const corrections = pgTable("corrections", {
  id: uuid("id").primaryKey().defaultRandom(),
  practiceId: text("practice_id").notNull().references(() => practices.id),
  reportedStatus: practiceStatusEnum("reported_status"),
  // "delist" is honoured within 24h, no justification required. Invariant 6.
  kind: text("kind").notNull(), // wrong_status | wrong_details | delist | other
  message: text("message"),
  fromPractice: boolean("from_practice").notNull().default(false),
  contactEmail: text("contact_email"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
