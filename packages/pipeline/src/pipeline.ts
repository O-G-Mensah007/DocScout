/**
 * Shared pipeline logic for Layer 2 (crawl) and Layer 3 (extract).
 *
 * Both the CLI and the cron routes call these functions. The CLI handles its
 * own argument parsing and output; the cron route handles auth and response
 * format. Neither contains pipeline logic.
 */
import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { nextRecheckDue, type StatusObservation } from "@docscout/core";
import { db, practices, snapshots, observations } from "@docscout/db";
import { candidateUrls, fetchPage } from "./crawl/fetcher";
import { extract, quoteAppearsInSource } from "./extract/extractor";
import { reconcile, type Candidate } from "./reconcile";

export type CrawlStats = {
  practicesProcessed: number;
  snapshotsSaved: number;
  skippedUnchanged: number;
  skippedRobots: number;
  errors: number;
};

export type ExtractStats = {
  practicesProcessed: number;
  observationsSaved: number;
  disputed: number;
  confabulationsBlocked: number;
};

/**
 * Crawl practices in a catchment, storing snapshots. Skips pages whose
 * content hash hasn't changed since the last snapshot (content-hash dedup).
 */
export async function crawlCatchment(opts: {
  catchment: string;
  limit: number;
  onProgress?: (name: string, url: string) => void;
}): Promise<CrawlStats> {
  const stats: CrawlStats = {
    practicesProcessed: 0,
    snapshotsSaved: 0,
    skippedUnchanged: 0,
    skippedRobots: 0,
    errors: 0,
  };

  const rows = await db()
    .select()
    .from(practices)
    .where(and(eq(practices.catchment, opts.catchment), isNull(practices.delistedAt)))
    .limit(opts.limit);

  for (const p of rows) {
    if (p.crawlBlocked || !p.websiteUrl) continue;
    stats.practicesProcessed++;

    for (const url of candidateUrls(p.websiteUrl)) {
      const out = await fetchPage(url);
      if (!out.ok) {
        if (out.reason === "robots") stats.skippedRobots++;
        else stats.errors++;
        continue;
      }

      // Content-hash dedup: skip if we already have a snapshot with this hash
      const existing = await db()
        .select({ id: snapshots.id })
        .from(snapshots)
        .where(
          and(
            eq(snapshots.practiceId, p.id),
            eq(snapshots.contentHash, out.contentHash),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        stats.skippedUnchanged++;
        continue;
      }

      await db().insert(snapshots).values({
        practiceId: p.id,
        sourceUrl: out.url,
        sourceType: "practice_website",
        httpStatus: out.httpStatus,
        contentHash: out.contentHash,
        body: out.text,
      });
      stats.snapshotsSaved++;
      opts.onProgress?.(p.name, out.url);
    }
  }

  return stats;
}

/**
 * Extract status from recent snapshots for practices in a catchment,
 * reconcile across sources, write observations, and update the denormalised
 * read cache on practices.
 */
export async function extractCatchment(opts: {
  catchment: string;
  limit?: number;
  onProgress?: (name: string, status: string, disputed: boolean) => void;
}): Promise<ExtractStats> {
  const stats: ExtractStats = {
    practicesProcessed: 0,
    observationsSaved: 0,
    disputed: 0,
    confabulationsBlocked: 0,
  };

  const rows = await db()
    .select()
    .from(practices)
    .where(and(eq(practices.catchment, opts.catchment), isNull(practices.delistedAt)))
    .limit(opts.limit ?? 1000);

  for (const p of rows) {
    stats.practicesProcessed++;

    const snaps = await db()
      .select()
      .from(snapshots)
      .where(eq(snapshots.practiceId, p.id))
      .orderBy(desc(snapshots.retrievedAt))
      .limit(6);

    if (snaps.length === 0) continue;

    const candidates: Candidate[] = [];

    for (const s of snaps) {
      const out = await extract({
        practiceName: p.name,
        sourceUrl: s.sourceUrl,
        retrievedAt: s.retrievedAt.toISOString(),
        pageText: s.body,
      });
      if (!out.ok) continue;

      const quoteOk =
        out.result.evidence_quote === null ||
        quoteAppearsInSource(out.result.evidence_quote, s.body);

      if (!quoteOk) stats.confabulationsBlocked++;

      candidates.push({
        result: out.result,
        sourceUrl: s.sourceUrl,
        sourceType: s.sourceType,
        retrievedAt: s.retrievedAt.toISOString(),
        quoteVerified: quoteOk,
      });
    }

    const r = reconcile(candidates);

    await db().insert(observations).values({
      practiceId: p.id,
      status: r.status,
      conditions: r.winner?.result.conditions ?? null,
      intakeMethod: r.winner?.result.intake_method ?? null,
      intakeUrl: r.winner?.result.intake_url ?? null,
      evidenceQuote: r.winner?.result.evidence_quote ?? null,
      method: "automated_extraction",
      confidence: r.score,
      model: process.env.EXTRACTION_MODEL ?? "claude-sonnet-4-6",
      reasoning: r.winner?.result.reasoning ?? null,
    });
    stats.observationsSaved++;

    const history = await db()
      .select()
      .from(observations)
      .where(eq(observations.practiceId, p.id))
      .orderBy(desc(observations.observedAt))
      .limit(50);

    const asObs: StatusObservation[] = history.map((h) => ({
      status: h.status,
      observed_at: h.observedAt.toISOString(),
      method: h.method,
    }));

    await db()
      .update(practices)
      .set({
        currentStatus: r.status,
        currentConditions: r.winner?.result.conditions ?? null,
        currentIntakeMethod: r.winner?.result.intake_method ?? null,
        currentIntakeUrl: r.winner?.result.intake_url ?? null,
        currentEvidenceQuote: r.winner?.result.evidence_quote ?? null,
        currentEvidenceUrl: r.winner?.sourceUrl ?? null,
        verifiedAt: new Date(),
        verificationMethod: "automated_extraction",
        confidence: r.score,
        recheckDue: nextRecheckDue(r.status, asObs),
        updatedAt: new Date(),
      })
      .where(eq(practices.id, p.id));

    if (r.disputed) stats.disputed++;
    opts.onProgress?.(p.name, r.status, r.disputed);
  }

  return stats;
}

/**
 * Return practices whose recheck is due (recheckDue <= now).
 * Used by the recheck cron to know which catchments need work.
 */
export async function practicesDueForRecheck(limit: number): Promise<string[]> {
  const rows = await db()
    .select({ catchment: practices.catchment })
    .from(practices)
    .where(
      and(
        isNull(practices.delistedAt),
        lte(practices.recheckDue, new Date()),
      ),
    )
    .limit(limit);

  return [...new Set(rows.map((r) => r.catchment))];
}
