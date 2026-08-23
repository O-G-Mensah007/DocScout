import { isAuthorizedCron, unauthorized } from "@/lib/cron-auth";
import { extractCatchment, practicesDueForRecheck } from "@docscout/pipeline/pipeline";

export const maxDuration = 300;

/**
 * Re-extract practices whose volatility-weighted recheck window has elapsed.
 * See nextRecheckDue() in @docscout/core — this is what keeps cost per
 * verified practice-month flat as the roster grows.
 */
export async function GET(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req)) return unauthorized();

  const catchments = await practicesDueForRecheck(200);
  const results: Record<string, { observations: number; disputed: number }> = {};

  for (const catchment of catchments) {
    const stats = await extractCatchment({ catchment, limit: 50 });
    results[catchment] = {
      observations: stats.observationsSaved,
      disputed: stats.disputed,
    };
  }

  return Response.json({
    ok: true,
    ran: "recheck",
    catchments: results,
    at: new Date().toISOString(),
  });
}
