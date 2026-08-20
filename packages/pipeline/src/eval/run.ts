/**
 * Extraction eval.
 *
 * Runs in CI on every PR against committed fixtures. In `EVAL_MODE=offline`
 * (the CI default) it exercises the schema and the quote-verification guard
 * without calling the API, so CI needs no secret and cannot be flaky. Run it
 * locally without EVAL_MODE to hit the real model.
 *
 * The golden set grows every time the week-4 phone audit disagrees with the
 * machine. That is the loop: disagreement becomes a fixture, the fixture
 * becomes a regression test, the regression test becomes the moat.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ExtractionResult, type PracticeStatus } from "@docscout/core";
import { extract, quoteAppearsInSource } from "../extract/extractor";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");

type Fixture = {
  name: string;
  practiceName: string;
  sourceUrl: string;
  pageText: string;
  expected: { status: PracticeStatus };
  /** offline-only: the payload a model might return, to test the guards */
  candidate?: unknown;
};

const MIN_PRECISION = 0.85;

async function main(): Promise<void> {
  const offline = process.env.EVAL_MODE === "offline";
  const files = (await readdir(FIXTURES)).filter((f) => f.endsWith(".json"));

  if (files.length === 0) {
    console.error("No fixtures found. The eval must not pass vacuously.");
    process.exit(1);
  }

  let correct = 0;
  let actionableCalls = 0;
  let actionableCorrect = 0;
  const failures: string[] = [];

  for (const file of files) {
    const fx = JSON.parse(await readFile(join(FIXTURES, file), "utf8")) as Fixture;

    let status: PracticeStatus;

    if (offline) {
      const parsed = ExtractionResult.safeParse(fx.candidate);
      if (!parsed.success) {
        // A rejected candidate is the CORRECT outcome when the fixture is
        // testing invariant 2. Rejection degrades to "unknown", never a claim.
        status = "unknown";
      } else if (
        parsed.data.evidence_quote &&
        !quoteAppearsInSource(parsed.data.evidence_quote, fx.pageText)
      ) {
        status = "unknown";
      } else {
        status = parsed.data.status;
      }
    } else {
      const out = await extract({
        practiceName: fx.practiceName,
        sourceUrl: fx.sourceUrl,
        retrievedAt: new Date().toISOString(),
        pageText: fx.pageText,
      });
      if (!out.ok) {
        status = "unknown";
      } else if (
        out.result.evidence_quote &&
        !quoteAppearsInSource(out.result.evidence_quote, fx.pageText)
      ) {
        failures.push(`${fx.name}: quote not found in source (confabulation guard fired)`);
        status = "unknown";
      } else {
        status = out.result.status;
      }
    }

    const hit = status === fx.expected.status;
    if (hit) correct++;
    else failures.push(`${fx.name}: expected ${fx.expected.status}, got ${status}`);

    // Precision is measured on actionable claims only — the ones that send a
    // real person to a real phone.
    if (status === "accepting" || status === "accepting_with_conditions") {
      actionableCalls++;
      if (hit) actionableCorrect++;
    }
  }

  const accuracy = correct / files.length;
  const precision = actionableCalls === 0 ? 1 : actionableCorrect / actionableCalls;

  console.log(`mode:      ${offline ? "offline" : "live"}`);
  console.log(`fixtures:  ${files.length}`);
  console.log(`accuracy:  ${(accuracy * 100).toFixed(1)}%`);
  console.log(`precision: ${(precision * 100).toFixed(1)}% (actionable claims only)`);
  for (const f of failures) console.log(`  FAIL ${f}`);

  if (precision < MIN_PRECISION) {
    console.error(`\nPrecision ${(precision * 100).toFixed(1)}% is below the ${MIN_PRECISION * 100}% floor.`);
    process.exit(1);
  }
  if (failures.length > 0 && offline) {
    console.error("\nOffline eval must be deterministic. Any failure is a real regression.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
