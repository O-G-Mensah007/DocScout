/**
 * Layer 1 orchestration: fetch → resolve → canonicalise → report.
 *
 * The database write is the last and least interesting step. Everything that
 * decides whether the roster is right happens before it, and all of it is
 * inspectable without a database via `--dry-run`.
 */
import { createHash } from "node:crypto";
import type { PracticeType } from "@docscout/core";
import { getCatchment, inCatchment } from "./catchments";
import type { Catchment } from "./catchments";
import { resolveEntities } from "./match";
import type { Cluster, MatchLink } from "./match";
import { normalizePostal, titleCase } from "./normalize";
import { fetchMohLio } from "./sources/moh-lio";
import { fetchOdhf } from "./sources/odhf";
import { loadCpsoExtract } from "./sources/cpso";
import { SOURCE_RANK } from "./sources/types";
import type { RosterCandidate, RosterSource } from "./sources/types";

export type SourceRef = {
  source: RosterSource;
  sourceId: string;
  name: string;
  sourceUrl: string;
  retrievedAt: string;
};

/** One resolved practice, ready to upsert. */
export type ResolvedPractice = {
  id: string;
  name: string;
  type: PracticeType;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postal: string;
  lat: number | null;
  lng: number | null;
  catchment: string;
  phone: string | null;
  websiteUrl: string | null;
  /**
   * True when the matcher could not safely decide this practice's composition —
   * that is, when getting it wrong would create a duplicate or merge away a real
   * practice. Advisory conflicts against the cross-check source do not set it
   * (they cannot change the roster), but they do appear in `reviewReasons`.
   */
  needsReview: boolean;
  matchConfidence: number;
  reviewReasons: string[];
  sourceRefs: SourceRef[];
};

export type RosterReport = {
  catchment: string;
  startedAt: string;
  finishedAt: string;
  /** Rows each source returned, before catchment filtering. */
  fetched: Record<string, number>;
  /** Rows each source contributed inside this catchment. */
  inCatchment: Record<string, number>;
  candidates: number;
  comparisons: number;
  clusters: number;
  merged: number;
  practices: number;
  needsReview: number;
  needsReviewRate: number;
  /** ODHF rows in-catchment that matched nothing — a coverage signal, not an error. */
  unmatchedCrossCheck: number;
  /**
   * Unresolved links to the cross-check source: usually the 2019-20 address for
   * a practice that has since moved. Advisory — surfaced for a human, but it
   * cannot change the roster, so it does not gate the run.
   */
  crossCheckConflicts: number;
  skipped: string[];
  reviewLinks: MatchLink[];
  dropped: Array<{ key: string; name: string; reason: string }>;
};

export type LoadOptions = {
  catchment: string;
  /** Skip the StatCan cross-check (offline runs, or when only MOH matters). */
  withCrossCheck?: boolean;
  cpsoExtractPath?: string | undefined;
  userAgent?: string | undefined;
  fetchImpl?: typeof fetch;
  /** Pre-fetched candidates, used by tests and `--from-seed`. */
  candidates?: readonly RosterCandidate[];
};

export type LoadResult = {
  practices: ResolvedPractice[];
  report: RosterReport;
  clusters: Array<Cluster<RosterCandidate>>;
};

/**
 * Build the roster for one catchment.
 *
 * Pure with respect to the database: it returns what *would* be written. The
 * CLI decides whether to write it.
 */
export async function buildRoster(opts: LoadOptions): Promise<LoadResult> {
  const catchment = getCatchment(opts.catchment);
  const startedAt = new Date().toISOString();
  const fetched: Record<string, number> = {};
  const skipped: string[] = [];

  let all: RosterCandidate[];
  if (opts.candidates) {
    all = [...opts.candidates];
    fetched.seed = all.length;
  } else {
    const moh = await fetchMohLio({
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
      ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
    });
    fetched.moh_lio = moh.length;
    all = [...moh];

    if (opts.withCrossCheck !== false) {
      const odhf = await fetchOdhf({
        ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
        ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
      });
      fetched.statcan_odhf = odhf.length;
      all.push(...odhf);
    } else {
      fetched.statcan_odhf = 0;
      skipped.push("StatCan ODHF cross-check disabled (--no-cross-check)");
    }

    const cpso = await loadCpsoExtract(opts.cpsoExtractPath);
    fetched.cpso = cpso.candidates.length;
    if (cpso.skippedReason) skipped.push(cpso.skippedReason);
    all.push(...cpso.candidates);
  }

  // ---- Catchment filter.
  const scoped = all.filter((c) => inCatchment(catchment, c));
  const inCatchmentCounts: Record<string, number> = {};
  for (const c of scoped) inCatchmentCounts[c.source] = (inCatchmentCounts[c.source] ?? 0) + 1;

  // ---- Resolve.
  const { clusters, reviewLinks, comparisons } = resolveEntities(scoped);

  // ---- Canonicalise.
  const byKey = new Map(scoped.map((c) => [c.key, c]));
  const practices: ResolvedPractice[] = [];
  const dropped: Array<{ key: string; name: string; reason: string }> = [];
  let unmatchedCrossCheck = 0;

  for (const cluster of clusters) {
    const ranked = [...cluster.members].sort(
      (a, b) => SOURCE_RANK[a.source] - SOURCE_RANK[b.source] || a.key.localeCompare(b.key),
    );
    const primary = ranked[0];
    if (!primary) continue;

    // Invariant of this layer: the cross-check never creates a practice. A
    // lone ODHF row means 2019-20 listed something the province no longer
    // does — worth counting, not worth publishing as current.
    if (primary.source === "statcan_odhf") {
      unmatchedCrossCheck++;
      dropped.push({
        key: primary.key,
        name: primary.name,
        reason: "cross-check-only source with no authoritative match",
      });
      continue;
    }

    const addressLine1 = pick(ranked, (c) => c.addressLine1);
    const city = pick(ranked, (c) => c.city);
    const postal = normalizePostal(pick(ranked, (c) => c.postal));

    if (!addressLine1 || !city || !postal) {
      dropped.push({
        key: primary.key,
        name: primary.name,
        reason: `incomplete address (line1=${!!addressLine1} city=${!!city} postal=${!!postal})`,
      });
      continue;
    }

    practices.push({
      id: practiceId(catchment, primary),
      name: primary.name,
      type: primary.type,
      addressLine1,
      addressLine2: pick(ranked, (c) => c.addressLine2),
      city: titleCase(city),
      postal: formatPostal(postal),
      lat: pickNum(ranked, (c) => c.lat),
      lng: pickNum(ranked, (c) => c.lng),
      catchment: catchment.slug,
      phone: pick(ranked, (c) => c.phone),
      websiteUrl: pick(ranked, (c) => c.websiteUrl),
      matchConfidence: cluster.confidence,
      // A review link is only roster-affecting when both ends could become
      // practices. The cross-check source never can, so an unresolved link to
      // it is advisory: it cannot duplicate or erase anything.
      needsReview: cluster.reviewLinks.some(
        (l) => !isCrossCheckOnly(l.a, byKey) && !isCrossCheckOnly(l.b, byKey),
      ),
      reviewReasons: cluster.reviewReasons,
      sourceRefs: ranked.map((c) => ({
        source: c.source,
        sourceId: c.sourceId,
        name: c.name,
        sourceUrl: c.sourceUrl,
        retrievedAt: c.retrievedAt,
      })),
    });
  }

  practices.sort((a, b) => a.id.localeCompare(b.id));

  const needsReview = practices.filter((p) => p.needsReview).length;
  const merged = clusters.filter((c) => c.members.length > 1).length;
  const crossCheckConflicts = reviewLinks.filter(
    (l) => isCrossCheckOnly(l.a, byKey) || isCrossCheckOnly(l.b, byKey),
  ).length;

  const report: RosterReport = {
    catchment: catchment.slug,
    startedAt,
    finishedAt: new Date().toISOString(),
    fetched,
    inCatchment: inCatchmentCounts,
    candidates: scoped.length,
    comparisons,
    clusters: clusters.length,
    merged,
    practices: practices.length,
    needsReview,
    needsReviewRate: practices.length === 0 ? 0 : needsReview / practices.length,
    unmatchedCrossCheck,
    crossCheckConflicts,
    skipped,
    reviewLinks,
    dropped,
  };

  return { practices, report, clusters };
}

/**
 * True when a candidate comes from a source that may only corroborate an
 * existing practice, never create one. Today that is the StatCan cross-check.
 */
function isCrossCheckOnly(key: string, byKey: Map<string, RosterCandidate>): boolean {
  return byKey.get(key)?.source === "statcan_odhf";
}

/** First non-null value in trust order. */
function pick(
  ranked: readonly RosterCandidate[],
  get: (c: RosterCandidate) => string | null,
): string | null {
  for (const c of ranked) {
    const v = get(c);
    if (v !== null && v.trim() !== "") return v;
  }
  return null;
}

function pickNum(
  ranked: readonly RosterCandidate[],
  get: (c: RosterCandidate) => number | null,
): number | null {
  for (const c of ranked) {
    const v = get(c);
    if (v !== null && Number.isFinite(v)) return v;
  }
  return null;
}

function formatPostal(p: string): string {
  return `${p.slice(0, 3)} ${p.slice(3)}`;
}

/**
 * Deterministic practice id: `on-<prefix>-<8 hex>`.
 *
 * Derived from the authoritative source identity so that re-running the loader
 * produces the same ids and the upsert is idempotent. It deliberately does not
 * hash the address: a clinic that corrects its suite number is the same
 * practice, and its observation history must survive the correction.
 */
export function practiceId(catchment: Catchment, primary: RosterCandidate): string {
  const identity =
    primary.source === "moh_lio" && primary.orgIdent
      ? `moh_lio:ident:${primary.orgIdent}`
      : primary.key;
  const h = createHash("sha256").update(identity).digest("hex").slice(0, 8);
  return `on-${catchment.idPrefix}-${h}`;
}
