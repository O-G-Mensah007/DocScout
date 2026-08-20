/**
 * Layer 3 + 4 — extract a status from each snapshot, reconcile across sources,
 * write an observation, and update the denormalised read cache.
 * Usage: pnpm extract -- --catchment toronto-east
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { nextRecheckDue, type StatusObservation } from "@docscout/core";
import { db, observations, practices, snapshots } from "@docscout/db";
import { extract, quoteAppearsInSource } from "../extract/extractor";
import { reconcile, type Candidate } from "../reconcile";
import { arg } from "./args";

async function main(): Promise<void> {
  const catchment = arg("catchment");

  const rows = await db()
    .select()
    .from(practices)
    .where(and(eq(practices.catchment, catchment), isNull(practices.delistedAt)));

  for (const p of rows) {
    const snaps = await db()
      .select()
      .from(snapshots)
      .where(eq(snapshots.practiceId, p.id))
      .orderBy(desc(snapshots.retrievedAt))
      .limit(6);

    const candidates: Candidate[] = [];

    for (const s of snaps) {
      const out = await extract({
        practiceName: p.name,
        sourceUrl: s.sourceUrl,
        retrievedAt: s.retrievedAt.toISOString(),
        pageText: s.body,
      });
      if (!out.ok) {
        console.log(`  ${p.name}: extraction ${out.reason} — ${out.detail}`);
        continue;
      }
      candidates.push({
        result: out.result,
        sourceUrl: s.sourceUrl,
        sourceType: s.sourceType,
        retrievedAt: s.retrievedAt.toISOString(),
        quoteVerified:
          out.result.evidence_quote === null ||
          quoteAppearsInSource(out.result.evidence_quote, s.body),
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

    console.log(`  ${p.name}: ${r.status}${r.disputed ? " (disputed — queue for phone audit)" : ""}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
