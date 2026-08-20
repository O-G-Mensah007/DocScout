import type { ExtractionResult, PracticeStatus } from "@docscout/core";

/**
 * Reconciliation across sources. Deliberately in code, not in the model.
 *
 * A practice may have a website saying one thing and a booking portal saying
 * another. Priority order reflects how reliable each source has proven to be:
 * a practice's own intake form beats its marketing copy, which beats a Google
 * Business profile that anyone can edit.
 */

export type Candidate = {
  result: ExtractionResult;
  sourceUrl: string;
  sourceType: string;
  retrievedAt: string;
  quoteVerified: boolean;
};

const SOURCE_WEIGHT: Record<string, number> = {
  phone_call: 1.0,
  practice_submission: 0.98,
  intake_form: 0.9,
  booking_platform: 0.85,
  practice_website: 0.8,
  google_business: 0.5,
  open_data: 0.3,
};

export type Reconciled = {
  status: PracticeStatus;
  winner: Candidate | null;
  score: number;
  /** true when sources disagree on an actionable status — route to phone audit */
  disputed: boolean;
};

export function reconcile(candidates: Candidate[]): Reconciled {
  const usable = candidates.filter(
    (c) => c.result.status !== "unknown" && c.quoteVerified,
  );

  if (usable.length === 0) {
    return { status: "unknown", winner: null, score: 0, disputed: false };
  }

  const scored = usable
    .map((c) => ({
      c,
      score: (SOURCE_WEIGHT[c.sourceType] ?? 0.4) * c.result.confidence * recency(c.retrievedAt),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0]!;
  const distinct = new Set(usable.map((c) => c.result.status));

  return {
    status: best.c.result.status,
    winner: best.c,
    score: Number(best.score.toFixed(4)),
    disputed: distinct.size > 1,
  };
}

function recency(retrievedAt: string): number {
  const days = (Date.now() - new Date(retrievedAt).getTime()) / 86_400_000;
  return Math.max(0.3, Math.pow(0.5, days / 30));
}
