/**
 * Layer 1 — the roster. Who exists.
 *
 * Fetches live from the Ontario Ministry of Health service-provider layer
 * (ESRI REST, Open Government Licence – Ontario), cross-checks against
 * Statistics Canada's ODHF, resolves the result to practices, and upserts.
 *
 * Usage:
 *   pnpm roster:load -- --catchment toronto-east
 *   pnpm roster:load -- --catchment waterloo --dry-run
 *   pnpm roster:load -- --catchment timmins --dry-run --review
 *   pnpm roster:load -- --catchment toronto-east --write-seed
 *   pnpm roster:load -- --catchment toronto-east --from-seed
 *
 * The run ends by printing the needs_review count and rate. If that rate is
 * above 10%, the matcher needs work — not a lower threshold. See
 * docs/adr/0003-roster-sources-and-entity-resolution.md.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { sql } from "drizzle-orm";
import { db, practices } from "@docscout/db";
import { arg, flag } from "./args";
import { buildRoster } from "../roster/load";
import type { LoadResult, ResolvedPractice } from "../roster/load";
import { CATCHMENTS } from "../roster/catchments";
import type { RosterCandidate } from "../roster/sources/types";

const REVIEW_RATE_CEILING = 0.1;

function seedPath(catchment: string): string {
  return resolve(process.cwd(), `data/seeds/${catchment}.candidates.json`);
}

async function main(): Promise<void> {
  const catchment = arg("catchment");
  const dryRun = flag("dry-run");
  const showReview = flag("review");
  const writeSeed = flag("write-seed");
  const fromSeed = flag("from-seed");
  const noCrossCheck = flag("no-cross-check");

  if (!CATCHMENTS.some((c) => c.slug === catchment)) {
    throw new Error(
      `Unknown catchment "${catchment}". Known: ${CATCHMENTS.map((c) => c.slug).join(", ")}`,
    );
  }

  const userAgent = process.env.CRAWLER_USER_AGENT;
  let result: LoadResult;

  if (fromSeed) {
    const path = seedPath(catchment);
    const seeded = JSON.parse(await readFile(path, "utf8")) as RosterCandidate[];
    console.log(`Reading ${seeded.length} cached candidates from ${path}`);
    result = await buildRoster({ catchment, candidates: seeded });
  } else {
    console.log(`Fetching live sources for "${catchment}" …`);
    result = await buildRoster({
      catchment,
      withCrossCheck: !noCrossCheck,
      cpsoExtractPath: process.env.CPSO_REGISTER_EXTRACT_PATH,
      ...(userAgent ? { userAgent } : {}),
    });
  }

  const { practices: rows, report } = result;
  printReport(result);

  if (writeSeed) {
    const path = seedPath(catchment);
    const candidates = result.clusters.flatMap((c) => c.members);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(candidates, null, 2)}\n`, "utf8");
    console.log(`\nWrote ${candidates.length} candidates to ${path}`);
  }

  if (showReview) printReviewQueue(result);

  if (dryRun) {
    console.log("\n--dry-run: nothing written to the database.");
  } else {
    await upsert(rows);
    console.log(`\nUpserted ${rows.length} practices into catchment "${catchment}".`);
    console.log(`Next: pnpm crawl -- --catchment ${catchment}`);
  }

  if (report.needsReviewRate > REVIEW_RATE_CEILING) {
    console.error(
      `\nneeds_review rate is ${pct(report.needsReviewRate)} (ceiling ${pct(REVIEW_RATE_CEILING)}). ` +
        `Improve the matcher's signals — do not lower the threshold.`,
    );
    process.exitCode = 1;
  }
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function printReport({ report }: LoadResult): void {
  const line = "─".repeat(62);
  console.log(`\n${line}\nRoster — ${report.catchment}\n${line}`);

  console.log("Fetched (province-wide):");
  for (const [k, v] of Object.entries(report.fetched)) {
    console.log(`  ${k.padEnd(16)} ${String(v).padStart(6)}`);
  }
  console.log("In catchment:");
  for (const [k, v] of Object.entries(report.inCatchment)) {
    console.log(`  ${k.padEnd(16)} ${String(v).padStart(6)}`);
  }

  console.log(
    `\n  candidates       ${String(report.candidates).padStart(6)}\n` +
      `  pairs compared   ${String(report.comparisons).padStart(6)}\n` +
      `  clusters         ${String(report.clusters).padStart(6)}\n` +
      `  multi-source     ${String(report.merged).padStart(6)}\n` +
      `  practices        ${String(report.practices).padStart(6)}`,
  );

  if (report.unmatchedCrossCheck > 0) {
    console.log(
      `  cross-check only ${String(report.unmatchedCrossCheck).padStart(6)}  ` +
        `(ODHF rows with no authoritative match — not loaded)`,
    );
  }

  if (report.crossCheckConflicts > 0) {
    console.log(
      `  stale addresses  ${String(report.crossCheckConflicts).padStart(6)}  ` +
        `(cross-check lists a loaded practice elsewhere — advisory)`,
    );
  }

  console.log(
    `\n  needs_review     ${String(report.needsReview).padStart(6)}  ` +
      `(${pct(report.needsReviewRate)} of practices)`,
  );

  for (const s of report.skipped) console.log(`\n  ! ${s}`);
}

function printReviewQueue({ report, clusters }: LoadResult): void {
  if (report.reviewLinks.length === 0) {
    console.log("\nReview queue is empty.");
    return;
  }
  console.log(`\n${"─".repeat(62)}\nReview queue — ${report.reviewLinks.length} unresolved pair(s)`);
  console.log("Left unmerged deliberately. A human decides.\n");
  const byKey = new Map(clusters.flatMap((c) => c.members).map((m) => [m.key, m]));
  for (const link of report.reviewLinks) {
    const a = byKey.get(link.a);
    const b = byKey.get(link.b);
    console.log(`  score ${link.score.toFixed(2)}`);
    console.log(`    A  ${a?.name} — ${a?.addressLine1}, ${a?.city} ${a?.postal} [${a?.source}]`);
    console.log(`    B  ${b?.name} — ${b?.addressLine1}, ${b?.city} ${b?.postal} [${b?.source}]`);
    for (const r of link.reasons) console.log(`       · ${r}`);
    console.log();
  }
}

/**
 * Idempotent upsert. Roster fields are refreshed; everything the later layers
 * own — status, evidence, verification, delisting — is left alone. Re-running
 * the loader must never resurrect a delisted practice or clear a verified
 * status (invariants 6 and 8).
 */
async function upsert(rows: readonly ResolvedPractice[]): Promise<void> {
  const now = new Date();
  for (const p of rows) {
    await db()
      .insert(practices)
      .values({
        id: p.id,
        name: p.name,
        type: p.type,
        addressLine1: p.addressLine1,
        addressLine2: p.addressLine2,
        city: p.city,
        postal: p.postal,
        lat: p.lat,
        lng: p.lng,
        catchment: p.catchment,
        phone: p.phone,
        websiteUrl: p.websiteUrl,
        sourceRefs: p.sourceRefs,
        matchConfidence: p.matchConfidence,
        needsReview: p.needsReview,
        reviewReasons: p.reviewReasons,
        rosterUpdatedAt: now,
      })
      .onConflictDoUpdate({
        target: practices.id,
        set: {
          name: sql`excluded.name`,
          type: sql`excluded.type`,
          addressLine1: sql`excluded.address_line1`,
          addressLine2: sql`excluded.address_line2`,
          city: sql`excluded.city`,
          postal: sql`excluded.postal`,
          lat: sql`excluded.lat`,
          lng: sql`excluded.lng`,
          catchment: sql`excluded.catchment`,
          // Never overwrite a known contact detail with a null.
          phone: sql`coalesce(excluded.phone, ${practices.phone})`,
          websiteUrl: sql`coalesce(excluded.website_url, ${practices.websiteUrl})`,
          sourceRefs: sql`excluded.source_refs`,
          matchConfidence: sql`excluded.match_confidence`,
          needsReview: sql`excluded.needs_review`,
          reviewReasons: sql`excluded.review_reasons`,
          rosterUpdatedAt: sql`excluded.roster_updated_at`,
          updatedAt: now,
        },
      });
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
