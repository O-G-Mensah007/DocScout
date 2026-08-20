/**
 * Every /api/cron/* route is guarded by a shared secret. Vercel Cron sends it
 * as `Authorization: Bearer $CRON_SECRET`. Without this the routes are a
 * public trigger for anything expensive.
 */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret === "change-me") return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401 });
}
