import { isAuthorizedCron, unauthorized } from "@/lib/cron-auth";
import { crawlCatchment, practicesDueForRecheck } from "@docscout/pipeline/pipeline";

export const maxDuration = 300;

/**
 * Nightly crawl of practices whose recheck is due.
 *
 * Finds catchments with practices due for recheck, then crawls up to 50
 * practices per catchment. Content-hash dedup skips pages that haven't
 * changed since the last snapshot.
 */
export async function GET(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req)) return unauthorized();

  const catchments = await practicesDueForRecheck(200);
  const results: Record<string, { snapshots: number; unchanged: number }> = {};

  for (const catchment of catchments) {
    const stats = await crawlCatchment({ catchment, limit: 50 });
    results[catchment] = {
      snapshots: stats.snapshotsSaved,
      unchanged: stats.skippedUnchanged,
    };
  }

  return Response.json({
    ok: true,
    ran: "crawl",
    catchments: results,
    at: new Date().toISOString(),
  });
}
