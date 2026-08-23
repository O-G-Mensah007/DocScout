import { and, eq, isNull, ilike, sql, desc } from "drizzle-orm";
import { db, practices } from "@docscout/db";
import type { PracticeStatus } from "@docscout/core";

export const dynamic = "force-dynamic";

/**
 * GET /api/practices?postal=M4K&status=accepting&lang=French&limit=50
 *
 * Returns practices matching filters. Postal prefix matches the first 3
 * characters (FSA). Status filters on currentStatus. Language does a
 * case-insensitive contains on the languages JSONB array.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const postal = url.searchParams.get("postal")?.trim().toUpperCase();
  const status = url.searchParams.get("status") as PracticeStatus | null;
  const lang = url.searchParams.get("lang")?.trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 200);

  const conditions = [isNull(practices.delistedAt)];

  if (postal && postal.length >= 3) {
    conditions.push(ilike(practices.postal, `${postal.slice(0, 3)}%`));
  }

  if (status) {
    conditions.push(eq(practices.currentStatus, status));
  }

  if (lang) {
    conditions.push(
      sql`${practices.languages}::jsonb @> ${JSON.stringify([lang])}::jsonb`,
    );
  }

  try {
    const rows = await db()
      .select({
        id: practices.id,
        name: practices.name,
        type: practices.type,
        addressLine1: practices.addressLine1,
        city: practices.city,
        postal: practices.postal,
        lat: practices.lat,
        lng: practices.lng,
        phone: practices.phone,
        websiteUrl: practices.websiteUrl,
        currentStatus: practices.currentStatus,
        currentConditions: practices.currentConditions,
        currentIntakeMethod: practices.currentIntakeMethod,
        currentIntakeUrl: practices.currentIntakeUrl,
        currentEvidenceQuote: practices.currentEvidenceQuote,
        currentEvidenceUrl: practices.currentEvidenceUrl,
        verifiedAt: practices.verifiedAt,
        confidence: practices.confidence,
        languages: practices.languages,
        mds: practices.mds,
        nps: practices.nps,
      })
      .from(practices)
      .where(and(...conditions))
      .orderBy(desc(practices.verifiedAt))
      .limit(limit);

    return Response.json({ ok: true, count: rows.length, practices: rows });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
