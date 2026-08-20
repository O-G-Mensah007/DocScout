import type { PracticeStatus, StatusObservation } from "./record";

/**
 * Freshness and volatility.
 *
 * A status is not a fact, it is a decaying claim. Invariant 8: we show the age
 * of every claim in plain language and treat "unknown" as a legitimate state.
 */

export type FreshnessBand = "today" | "days" | "weeks" | "stale" | "unknown";

const DAY_MS = 86_400_000;

export function ageInDays(verifiedAt: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(verifiedAt).getTime()) / DAY_MS);
}

export function freshnessBand(
  verifiedAt: string | null,
  now: Date = new Date(),
): FreshnessBand {
  if (!verifiedAt) return "unknown";
  const days = ageInDays(verifiedAt, now);
  if (days <= 1) return "today";
  if (days <= 7) return "days";
  if (days <= 30) return "weeks";
  return "stale";
}

/** The exact words shown to a patient. Never round in our own favour. */
export function freshnessLabel(
  verifiedAt: string | null,
  now: Date = new Date(),
): string {
  if (!verifiedAt) return "Not yet verified";
  const days = ageInDays(verifiedAt, now);
  if (days <= 0) return "Verified today";
  if (days === 1) return "Verified yesterday";
  if (days < 7) return `Verified ${days} days ago`;
  if (days < 14) return "Verified last week";
  if (days < 60) return `Verified ${Math.floor(days / 7)} weeks ago`;
  return `Verified ${Math.floor(days / 30)} months ago`;
}

/**
 * Confidence decays with age, and decays faster for statuses that are
 * inherently volatile. "not_accepting" is sticky in the real world; a panel
 * that just opened is the most perishable claim we hold.
 */
const HALF_LIFE_DAYS: Record<PracticeStatus, number> = {
  accepting: 10,
  accepting_with_conditions: 14,
  waitlist_only: 45,
  not_accepting: 60,
  unknown: 7,
};

export function decayedConfidence(
  base: number,
  status: PracticeStatus,
  verifiedAt: string,
  now: Date = new Date(),
): number {
  const halfLife = HALF_LIFE_DAYS[status];
  const days = Math.max(0, ageInDays(verifiedAt, now));
  return Number((base * Math.pow(0.5, days / halfLife)).toFixed(4));
}

/**
 * Volatility-weighted recheck scheduling. A practice that has changed status
 * twice this year gets looked at weekly; a CHC that has said the same thing
 * for three years gets looked at monthly. This is what keeps cost per verified
 * practice-month flat as the roster grows.
 */
export function nextRecheckDue(
  status: PracticeStatus,
  history: StatusObservation[],
  now: Date = new Date(),
): Date {
  const oneYearAgo = now.getTime() - 365 * DAY_MS;
  const recent = history.filter(
    (h) => new Date(h.observed_at).getTime() >= oneYearAgo,
  );

  let changes = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i]!.status !== recent[i - 1]!.status) changes++;
  }

  const base = HALF_LIFE_DAYS[status];
  // Each observed change in the last year halves the interval, floored at 3d.
  const interval = Math.max(3, Math.round(base / Math.pow(2, Math.min(changes, 3))));
  return new Date(now.getTime() + interval * DAY_MS);
}
