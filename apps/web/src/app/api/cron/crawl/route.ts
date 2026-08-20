import { isAuthorizedCron, unauthorized } from "@/lib/cron-auth";

export const maxDuration = 300;

/**
 * Nightly crawl of practices whose recheck is due.
 *
 * TODO(week-2): move the loop here from packages/pipeline/src/cli/crawl.ts so
 * the CLI and the cron share one implementation. Keep the batch small enough
 * to finish inside maxDuration; page through with a cursor rather than
 * raising the limit.
 */
export async function GET(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req)) return unauthorized();
  return Response.json({ ok: true, ran: "crawl", at: new Date().toISOString() });
}
