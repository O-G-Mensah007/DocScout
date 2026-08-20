/**
 * Layer 2 — evidence. Snapshot what practices already publish.
 * Usage: pnpm crawl -- --catchment toronto-east [--limit 25]
 */
import { and, eq, isNull } from "drizzle-orm";
import { db, practices, snapshots } from "@docscout/db";
import { candidateUrls, fetchPage } from "../crawl/fetcher";
import { arg } from "./args";

async function main(): Promise<void> {
  const catchment = arg("catchment");
  const limit = Number(arg("limit", "50"));

  const rows = await db()
    .select()
    .from(practices)
    .where(and(eq(practices.catchment, catchment), isNull(practices.delistedAt)))
    .limit(limit);

  console.log(`Crawling ${rows.length} practices in "${catchment}"`);

  for (const p of rows) {
    if (p.crawlBlocked || !p.websiteUrl) continue;

    for (const url of candidateUrls(p.websiteUrl)) {
      const out = await fetchPage(url);
      if (!out.ok) {
        if (out.reason === "robots") console.log(`  skip (robots): ${url}`);
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
      console.log(`  snapshot: ${out.url}`);
    }
  }

  console.log("Done. Next: pnpm extract -- --catchment " + catchment);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
