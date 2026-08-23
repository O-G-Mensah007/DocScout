/**
 * Layer 2 dry-run — crawl and extract without a database.
 *
 * Takes a roster (from --from-seed or live fetch) and for each practice that
 * has a website, crawls candidate pages, runs LLM extraction, verifies quotes,
 * reconciles, and prints the result. No database required.
 *
 * Usage:
 *   pnpm verify -- --catchment toronto-east [--limit 5] [--from-seed]
 *
 * Requires ANTHROPIC_API_KEY in the environment.
 */
import { buildRoster } from "../roster/load";
import type { ResolvedPractice } from "../roster/load";
import { candidateUrls, fetchPage } from "../crawl/fetcher";
import { extract, quoteAppearsInSource } from "../extract/extractor";
import { reconcile, type Candidate } from "../reconcile";
import { arg, flag } from "./args";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { RosterCandidate } from "../roster/sources/types";

type VerifyResult = {
  practiceId: string;
  name: string;
  websiteUrl: string | null;
  status: string;
  confidence: number;
  evidenceQuote: string | null;
  evidenceUrl: string | null;
  intakeMethod: string | null;
  intakePhone: string | null;
  disputed: boolean;
  pagesChecked: number;
  pagesCrawled: string[];
  pagesSkipped: Array<{ url: string; reason: string }>;
};

async function main(): Promise<void> {
  const catchment = arg("catchment");
  const limit = Number(arg("limit", "50"));
  const fromSeed = flag("from-seed");
  const jsonOut = flag("json");

  let practices: ResolvedPractice[];

  if (fromSeed) {
    const HERE = dirname(fileURLToPath(import.meta.url));
    const seedPath = join(HERE, "..", "..", "data", "seeds", `${catchment}.candidates.json`);
    const raw = JSON.parse(await readFile(seedPath, "utf8")) as RosterCandidate[];
    const result = await buildRoster({ catchment, candidates: raw });
    practices = result.practices;
  } else {
    const result = await buildRoster({ catchment, userAgent: "DocScoutBot/0.1 (+https://docscout.ca/bot)" });
    practices = result.practices;
  }

  const withWebsite = practices.filter((p) => p.websiteUrl);
  const toProcess = withWebsite.slice(0, limit);

  if (!jsonOut) {
    console.log(`\nVerify — ${catchment}`);
    console.log(`  ${practices.length} practices, ${withWebsite.length} with website, processing ${toProcess.length}\n`);
  }

  const results: VerifyResult[] = [];

  for (const p of toProcess) {
    if (!p.websiteUrl) continue;
    const urls = candidateUrls(p.websiteUrl);
    const candidates: Candidate[] = [];
    const crawled: string[] = [];
    const skipped: Array<{ url: string; reason: string }> = [];

    for (const url of urls) {
      const page = await fetchPage(url);
      if (!page.ok) {
        skipped.push({ url, reason: page.reason });
        continue;
      }

      if (page.text.trim().length < 50) {
        skipped.push({ url, reason: "too_short" });
        continue;
      }

      crawled.push(url);

      const out = await extract({
        practiceName: p.name,
        sourceUrl: url,
        retrievedAt: page.retrievedAt,
        pageText: page.text,
      });

      if (!out.ok) {
        if (!jsonOut) console.log(`  ${p.name}: extraction ${out.reason} on ${url}`);
        continue;
      }

      const quoteOk =
        out.result.evidence_quote === null ||
        quoteAppearsInSource(out.result.evidence_quote, page.text);

      if (!quoteOk && !jsonOut) {
        console.log(`  ${p.name}: confabulation guard fired on ${url}`);
      }

      candidates.push({
        result: out.result,
        sourceUrl: url,
        sourceType: "practice_website",
        retrievedAt: page.retrievedAt,
        quoteVerified: quoteOk,
      });

      // If we found an actionable status with a verified quote, stop crawling
      // more pages for this practice — we have what we need.
      if (
        quoteOk &&
        out.result.status !== "unknown" &&
        out.result.confidence >= 0.8
      ) {
        break;
      }
    }

    const r = reconcile(candidates);

    const result: VerifyResult = {
      practiceId: p.id,
      name: p.name,
      websiteUrl: p.websiteUrl,
      status: r.status,
      confidence: r.score,
      evidenceQuote: r.winner?.result.evidence_quote ?? null,
      evidenceUrl: r.winner?.sourceUrl ?? null,
      intakeMethod: r.winner?.result.intake_method ?? null,
      intakePhone: r.winner?.result.intake_phone ?? null,
      disputed: r.disputed,
      pagesChecked: urls.length,
      pagesCrawled: crawled,
      pagesSkipped: skipped,
    };
    results.push(result);

    if (!jsonOut) {
      const badge =
        r.status === "unknown"
          ? "?"
          : r.status === "accepting" || r.status === "accepting_with_conditions"
            ? "✓"
            : "✗";
      console.log(
        `  ${badge} ${p.name}: ${r.status}` +
          (r.score > 0 ? ` (${(r.score * 100).toFixed(0)}%)` : "") +
          (r.disputed ? " DISPUTED" : ""),
      );
      if (r.winner?.result.evidence_quote) {
        console.log(`    "${r.winner.result.evidence_quote}"`);
      }
      console.log(`    crawled ${crawled.length}/${urls.length} pages`);
    }
  }

  if (jsonOut) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log("\n" + "─".repeat(60));
    const accepting = results.filter(
      (r) => r.status === "accepting" || r.status === "accepting_with_conditions",
    );
    const notAccepting = results.filter((r) => r.status === "not_accepting");
    const unknown = results.filter((r) => r.status === "unknown");
    const waitlist = results.filter((r) => r.status === "waitlist_only");
    console.log(
      `  accepting: ${accepting.length}  not_accepting: ${notAccepting.length}  ` +
        `waitlist: ${waitlist.length}  unknown: ${unknown.length}`,
    );
    const disputed = results.filter((r) => r.disputed);
    if (disputed.length > 0) {
      console.log(`  disputed: ${disputed.length} (route to phone audit)`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
