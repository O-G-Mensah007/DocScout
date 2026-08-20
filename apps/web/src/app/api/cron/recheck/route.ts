import { isAuthorizedCron, unauthorized } from "@/lib/cron-auth";

export const maxDuration = 300;

/**
 * Re-extract practices whose volatility-weighted recheck window has elapsed.
 * See nextRecheckDue() in @docscout/core — this is what keeps cost per
 * verified practice-month flat as the roster grows.
 */
export async function GET(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req)) return unauthorized();
  return Response.json({ ok: true, ran: "recheck", at: new Date().toISOString() });
}
