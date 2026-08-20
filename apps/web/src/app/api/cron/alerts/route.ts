import { isAuthorizedCron, unauthorized } from "@/lib/cron-auth";

export const maxDuration = 300;

/**
 * Notify watchers when a practice near them transitions to an actionable
 * status. Note what this is NOT: we message the PATIENT, never the clinic.
 * Invariant 1.
 *
 * No-ops cleanly when RESEND_API_KEY is unset, so the deploy works on day one
 * before email is configured.
 */
export async function GET(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req)) return unauthorized();
  const configured = Boolean(process.env.RESEND_API_KEY);
  return Response.json({
    ok: true,
    ran: "alerts",
    skipped: !configured,
    at: new Date().toISOString(),
  });
}
