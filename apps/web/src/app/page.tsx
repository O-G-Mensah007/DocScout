import { desc, isNull } from "drizzle-orm";
import { db, practices } from "@docscout/db";
import { Search } from "./search";

/**
 * Rendered per request. Deliberately NOT statically prerendered: the first
 * deploy of a fresh clone must succeed before anyone has run a migration, and
 * a build-time DB query would fail there. Add caching when there is traffic to
 * justify it, not before.
 */
export const dynamic = "force-dynamic";

async function loadPractices() {
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
      .where(isNull(practices.delistedAt))
      .orderBy(desc(practices.verifiedAt))
      .limit(100);

    const serialized = rows.map((r) => ({
      ...r,
      verifiedAt: r.verifiedAt?.toISOString() ?? null,
    }));

    return { rows: serialized, error: null };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function Home() {
  const { rows, error } = await loadPractices();

  return (
    <>
      <h1>Which Ontario practices are accepting new patients</h1>
      <p className="subtitle">
        Every status below shows the sentence we found, where we found it, and
        the date we checked. When we don&rsquo;t know, we say so.
      </p>

      {error && (
        <div className="card">
          <h3>The index isn&rsquo;t connected yet</h3>
          <p className="addr">
            Set <code>DATABASE_URL</code> and run <code>pnpm db:migrate</code>,
            then load a catchment with <code>pnpm roster:load</code>. See{" "}
            <code>docs/02-runbook.md</code>.
          </p>
        </div>
      )}

      <Search initial={rows} />

      <div className="hcc-banner">
        <p>
          Also register with{" "}
          <a href="https://www.ontario.ca/page/health-care-connect">
            Health Care Connect
          </a>{" "}
          — Ontario&rsquo;s free official service that matches unattached patients
          to providers. Doc-Scout complements it, not replaces it.
        </p>
      </div>
    </>
  );
}
