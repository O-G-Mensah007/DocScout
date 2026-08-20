/**
 * Layer 5 — the human loop. Exports a call sheet as CSV.
 *
 * The `random` sample is the only one that produces an honest precision
 * number. Do not replace it with "records we already suspect are wrong" —
 * a health-system buyer's analyst will find that inflation.
 *
 * Usage: pnpm audit:export -- --catchment toronto-east --n 100
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, practices } from "@docscout/db";
import { arg } from "./args";

async function main(): Promise<void> {
  const catchment = arg("catchment");
  const n = Number(arg("n", "100"));

  const rows = await db()
    .select()
    .from(practices)
    .where(and(eq(practices.catchment, catchment), isNull(practices.delistedAt)))
    .orderBy(sql`random()`)
    .limit(n);

  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  console.log(
    ["practice_id", "name", "phone", "machine_status", "confidence", "evidence_quote", "human_status", "notes"]
      .map(esc)
      .join(","),
  );
  for (const p of rows) {
    console.log(
      [p.id, p.name, p.phone, p.currentStatus, p.confidence, p.currentEvidenceQuote, "", ""]
        .map(esc)
        .join(","),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
