import { desc, isNull } from "drizzle-orm";
import { freshnessLabel, isActionable } from "@docscout/core";
import { db, practices } from "@docscout/db";

/**
 * Rendered per request. Deliberately NOT statically prerendered: the first
 * deploy of a fresh clone must succeed before anyone has run a migration, and
 * a build-time DB query would fail there. Add caching when there is traffic to
 * justify it, not before.
 */
export const dynamic = "force-dynamic";

type Row = typeof practices.$inferSelect;

async function loadPractices(): Promise<{ rows: Row[]; error: string | null }> {
  try {
    const rows = await db()
      .select()
      .from(practices)
      .where(isNull(practices.delistedAt))
      .orderBy(desc(practices.verifiedAt))
      .limit(100);
    return { rows, error: null };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function Home() {
  const { rows, error } = await loadPractices();
  const open = rows.filter((r) => isActionable(r.currentStatus));

  return (
    <>
      <h1>Which Ontario practices are accepting new patients</h1>
      <p>
        Every status below shows the sentence we found, where we found it, and the date we
        checked. When we don&rsquo;t know, we say so.
      </p>

      {error && (
        <div className="card">
          <h3>The index isn&rsquo;t connected yet</h3>
          <p className="addr">
            Set <code>DATABASE_URL</code> and run <code>pnpm db:migrate</code>, then load a
            catchment with <code>pnpm roster:load</code>. See <code>docs/02-runbook.md</code>.
          </p>
        </div>
      )}

      {!error && (
        <p>
          <strong>{open.length}</strong> of {rows.length} practices in the index have an open
          or conditional intake as of their last check.
        </p>
      )}

      {/* TODO(week-5): map view, postal-code filter, language filter, watch signup. */}
      {rows.map((p) => (
        <article key={p.id} className="card">
          <h3>{p.name}</h3>
          <p className="addr">
            {p.addressLine1}, {p.city} {p.postal}
          </p>
          <p>
            <span className={`status ${p.currentStatus}`}>{label(p.currentStatus)}</span>{" "}
            <span className="freshness">
              · {freshnessLabel(p.verifiedAt?.toISOString() ?? null)}
            </span>
          </p>
          {p.currentEvidenceQuote && (
            <blockquote className="evidence">
              &ldquo;{p.currentEvidenceQuote}&rdquo;
              {p.currentEvidenceUrl && (
                <>
                  {" "}
                  <a href={p.currentEvidenceUrl} rel="nofollow noopener">
                    source
                  </a>
                </>
              )}
            </blockquote>
          )}
          {p.currentIntakeUrl && isActionable(p.currentStatus) && (
            <p>
              <a href={p.currentIntakeUrl} rel="nofollow noopener">
                Contact this practice directly →
              </a>
            </p>
          )}
        </article>
      ))}
    </>
  );
}

function label(s: Row["currentStatus"]): string {
  switch (s) {
    case "accepting":
      return "Accepting new patients";
    case "accepting_with_conditions":
      return "Accepting, with conditions";
    case "waitlist_only":
      return "Waitlist only";
    case "not_accepting":
      return "Not accepting";
    default:
      return "Not yet verified";
  }
}
