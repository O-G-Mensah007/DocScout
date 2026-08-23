/**
 * Layer 2 — evidence. Snapshot what practices already publish.
 * Usage: pnpm crawl -- --catchment toronto-east [--limit 25]
 */
import { crawlCatchment } from "../pipeline";
import { arg } from "./args";

async function main(): Promise<void> {
  const catchment = arg("catchment");
  const limit = Number(arg("limit", "50"));

  console.log(`Crawling up to ${limit} practices in "${catchment}"`);

  const stats = await crawlCatchment({
    catchment,
    limit,
    onProgress: (name, url) => console.log(`  snapshot: ${name} — ${url}`),
  });

  console.log(
    `\nDone. ${stats.snapshotsSaved} snapshots saved, ` +
      `${stats.skippedUnchanged} unchanged, ${stats.skippedRobots} blocked by robots.txt` +
      (stats.errors > 0 ? `, ${stats.errors} errors` : ""),
  );
  console.log("Next: pnpm extract -- --catchment " + catchment);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
