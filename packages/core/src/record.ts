import { z } from "zod";

/**
 * The record.
 *
 * This is the centre of the system. It is the shape the extractor must emit,
 * the shape the database stores, and the shape the API returns. Changing it is
 * a migration + an extractor change + an eval change + a UI change.
 *
 * Invariant 2 (see CLAUDE.md) is enforced here, not in the prompt: a status
 * other than "unknown" REQUIRES a non-empty evidence quote. The model is
 * structurally incapable of asserting something it cannot cite.
 */

export const PracticeStatus = z.enum([
  "accepting",
  "accepting_with_conditions",
  "waitlist_only",
  "not_accepting",
  "unknown",
]);
export type PracticeStatus = z.infer<typeof PracticeStatus>;

/** Statuses that mean a patient has somewhere to go right now. */
export const ACTIONABLE_STATUSES: readonly PracticeStatus[] = [
  "accepting",
  "accepting_with_conditions",
] as const;

export function isActionable(status: PracticeStatus): boolean {
  return ACTIONABLE_STATUSES.includes(status);
}

export const PracticeType = z.enum([
  "FHT", // Family Health Team
  "FHO", // Family Health Organization
  "FHG", // Family Health Group
  "CHC", // Community Health Centre
  "NPLC", // Nurse Practitioner-Led Clinic
  "AHAC", // Aboriginal Health Access Centre
  "solo",
  "walk_in",
  "other",
]);
export type PracticeType = z.infer<typeof PracticeType>;

export const IntakeMethod = z.enum([
  "web_form",
  "phone",
  "email",
  "hcc", // routed through Health Care Connect
  "portal", // JaneApp, Ocean, Medeo, Oscar, Telus etc.
  "in_person",
  "unknown",
]);
export type IntakeMethod = z.infer<typeof IntakeMethod>;

export const SourceType = z.enum([
  "practice_website",
  "booking_platform",
  "google_business",
  "intake_form",
  "phone_call",
  "practice_submission",
  "open_data",
]);
export type SourceType = z.infer<typeof SourceType>;

export const VerificationMethod = z.enum([
  "automated_extraction",
  "human_phone",
  "practice_submission",
]);
export type VerificationMethod = z.infer<typeof VerificationMethod>;

export const Conditions = z.object({
  /** e.g. "within clinic catchment only", "postal codes starting M4K" */
  geography: z.string().nullable(),
  /** null when no referral pathway is stated */
  referral_required: z.enum(["hcc", "physician", "self", "other"]).nullable(),
  /** e.g. "all", "18+", "paediatric only" */
  age: z.string().nullable(),
  /** provider types with open panels, when the source distinguishes them */
  provider_types: z.array(z.enum(["md", "np", "rn", "other"])).default([]),
  notes: z.string().nullable(),
});
export type Conditions = z.infer<typeof Conditions>;

export const Evidence = z.object({
  /**
   * Verbatim, from the source document. Not paraphrased, not summarised.
   * If the model cannot produce this, the status must be "unknown".
   */
  quote: z.string().min(1).max(2000),
  source_url: z.string().url(),
  source_type: SourceType,
  retrieved_at: z.string().datetime({ offset: true }),
  snapshot_id: z.string().min(1),
});
export type Evidence = z.infer<typeof Evidence>;

/**
 * What the extractor is asked to produce from a single snapshot.
 * Deliberately narrow: the model's whole job is reading one document and
 * saying what it says. Reconciliation across sources happens in code.
 */
export const ExtractionResult = z
  .object({
    status: PracticeStatus,
    conditions: Conditions,
    intake_method: IntakeMethod,
    intake_url: z.string().url().nullable(),
    intake_phone: z.string().nullable(),
    languages: z.array(z.string()).default([]),
    /** null only when status is "unknown" — see refinement below */
    evidence_quote: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    /** the model's own account of why, useful when auditing disagreements */
    reasoning: z.string().max(600),
  })
  .refine(
    (r) =>
      r.status === "unknown" ||
      (r.evidence_quote !== null && r.evidence_quote.trim().length > 0),
    {
      message:
        "Invariant 2: a status other than 'unknown' requires a verbatim evidence quote.",
      path: ["evidence_quote"],
    },
  );
export type ExtractionResult = z.infer<typeof ExtractionResult>;

export const Verification = z.object({
  verified_at: z.string().datetime({ offset: true }),
  method: VerificationMethod,
  confidence: z.number().min(0).max(1),
  last_human_check: z.string().datetime({ offset: true }).nullable(),
  recheck_due: z.string().datetime({ offset: true }),
});
export type Verification = z.infer<typeof Verification>;

export const StatusObservation = z.object({
  status: PracticeStatus,
  observed_at: z.string().datetime({ offset: true }),
  method: VerificationMethod,
});
export type StatusObservation = z.infer<typeof StatusObservation>;

/**
 * The full public record. `history` looks like an afterthought and is the most
 * valuable field in the object: twelve months of it answers the question
 * nobody in Ontario can currently answer — when and where does primary-care
 * capacity actually open?
 */
export const PracticeRecord = z.object({
  practice_id: z.string().min(1),
  name: z.string().min(1),
  type: PracticeType,
  address: z.object({
    line1: z.string(),
    city: z.string(),
    postal: z.string(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
  }),
  catchment: z.string(),
  providers: z.object({ mds: z.number().int().nullable(), nps: z.number().int().nullable() }),
  languages: z.array(z.string()).default([]),
  status: PracticeStatus,
  conditions: Conditions.nullable(),
  intake_channel: z.object({
    method: IntakeMethod,
    url: z.string().url().nullable(),
    phone: z.string().nullable(),
  }),
  evidence: Evidence.nullable(),
  verification: Verification,
  history: z.array(StatusObservation).default([]),
  /** set when a practice has asked to be delisted — see invariant 6 */
  delisted_at: z.string().datetime({ offset: true }).nullable().default(null),
});
export type PracticeRecord = z.infer<typeof PracticeRecord>;
