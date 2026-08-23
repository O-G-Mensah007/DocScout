"use client";

import { useState, useCallback, type FormEvent } from "react";
import { freshnessLabel, isActionable, type PracticeStatus } from "@docscout/core";

type Practice = {
  id: string;
  name: string;
  type: string;
  addressLine1: string;
  city: string;
  postal: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  websiteUrl: string | null;
  currentStatus: PracticeStatus;
  currentConditions: Record<string, unknown> | null;
  currentIntakeMethod: string | null;
  currentIntakeUrl: string | null;
  currentEvidenceQuote: string | null;
  currentEvidenceUrl: string | null;
  verifiedAt: string | null;
  confidence: number | null;
  languages: string[];
  mds: number | null;
  nps: number | null;
};

type WatchState = "idle" | "submitting" | "done" | "error";

function statusLabel(s: PracticeStatus): string {
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

function intakeLabel(m: string | null): string | null {
  switch (m) {
    case "web_form": return "Online form";
    case "phone": return "Phone";
    case "email": return "Email";
    case "hcc": return "Health Care Connect";
    case "portal": return "Patient portal";
    case "in_person": return "In person";
    default: return null;
  }
}

export function Search({ initial }: { initial: Practice[] }) {
  const [postal, setPostal] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [results, setResults] = useState<Practice[]>(initial);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [watchEmail, setWatchEmail] = useState("");
  const [watchState, setWatchState] = useState<WatchState>("idle");

  const doSearch = useCallback(async (e?: FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setSearched(true);

    const params = new URLSearchParams();
    if (postal.trim()) params.set("postal", postal.trim());
    if (statusFilter) params.set("status", statusFilter);
    params.set("limit", "100");

    try {
      const res = await fetch(`/api/practices?${params}`);
      const data = await res.json();
      if (data.ok) setResults(data.practices);
    } finally {
      setLoading(false);
    }
  }, [postal, statusFilter]);

  const submitWatch = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!watchEmail || !postal.trim()) return;
    setWatchState("submitting");
    try {
      const res = await fetch("/api/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: watchEmail, postal: postal.trim() }),
      });
      const data = await res.json();
      setWatchState(data.ok ? "done" : "error");
    } catch {
      setWatchState("error");
    }
  }, [watchEmail, postal]);

  const accepting = results.filter((p) => isActionable(p.currentStatus));

  return (
    <>
      <form className="search-bar" onSubmit={doSearch}>
        <div className="search-fields">
          <input
            type="text"
            placeholder="Postal code (e.g. M4K)"
            value={postal}
            onChange={(e) => setPostal(e.target.value)}
            maxLength={7}
            className="search-input"
            aria-label="Postal code"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="search-select"
            aria-label="Status filter"
          >
            <option value="">All statuses</option>
            <option value="accepting">Accepting</option>
            <option value="accepting_with_conditions">Accepting (conditions)</option>
            <option value="waitlist_only">Waitlist only</option>
            <option value="not_accepting">Not accepting</option>
            <option value="unknown">Not yet verified</option>
          </select>
          <button type="submit" className="search-btn" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </form>

      <div className="results-summary">
        {searched ? (
          <p>
            <strong>{accepting.length}</strong> accepting of{" "}
            <strong>{results.length}</strong> practices found
            {postal.trim() ? ` near ${postal.trim().toUpperCase()}` : ""}
          </p>
        ) : (
          <p>
            <strong>{accepting.length}</strong> of {results.length} practices
            in the index have an open or conditional intake
          </p>
        )}
      </div>

      {results.length === 0 && searched && (
        <div className="card">
          <p>No practices found. Try a different postal code or broaden your filters.</p>
        </div>
      )}

      <div className="practice-list">
        {results.map((p) => (
          <article key={p.id} className="card">
            <div className="card-header">
              <h3>{p.name}</h3>
              <span className="practice-type">{p.type}</span>
            </div>
            <p className="addr">
              {p.addressLine1}, {p.city} {p.postal}
            </p>
            <p>
              <span className={`status ${p.currentStatus}`}>
                {statusLabel(p.currentStatus)}
              </span>{" "}
              <span className="freshness">
                · {freshnessLabel(p.verifiedAt)}
              </span>
            </p>

            {p.currentConditions && p.currentStatus === "accepting_with_conditions" && (
              <div className="conditions">
                {(p.currentConditions as { geography?: string }).geography && (
                  <span className="condition-tag">
                    {(p.currentConditions as { geography: string }).geography}
                  </span>
                )}
                {(p.currentConditions as { age?: string }).age && (
                  <span className="condition-tag">
                    {(p.currentConditions as { age: string }).age}
                  </span>
                )}
                {(p.currentConditions as { notes?: string }).notes && (
                  <span className="condition-tag">
                    {(p.currentConditions as { notes: string }).notes}
                  </span>
                )}
              </div>
            )}

            {p.currentEvidenceQuote && (
              <blockquote className="evidence">
                &ldquo;{p.currentEvidenceQuote}&rdquo;
                {p.currentEvidenceUrl && (
                  <>
                    {" "}
                    <a href={p.currentEvidenceUrl} rel="nofollow noopener" target="_blank">
                      source
                    </a>
                  </>
                )}
              </blockquote>
            )}

            <div className="card-footer">
              {p.phone && (
                <a href={`tel:${p.phone}`} className="contact-link">
                  {p.phone}
                </a>
              )}
              {intakeLabel(p.currentIntakeMethod) && (
                <span className="intake-method">
                  Intake: {intakeLabel(p.currentIntakeMethod)}
                </span>
              )}
              {p.currentIntakeUrl && isActionable(p.currentStatus) && (
                <a href={p.currentIntakeUrl} rel="nofollow noopener" target="_blank" className="contact-link">
                  Contact this practice →
                </a>
              )}
              {p.languages.length > 0 && (
                <span className="languages">
                  {p.languages.join(", ")}
                </span>
              )}
              {(p.mds || p.nps) && (
                <span className="providers">
                  {p.mds ? `${p.mds} MD${p.mds > 1 ? "s" : ""}` : ""}
                  {p.mds && p.nps ? ", " : ""}
                  {p.nps ? `${p.nps} NP${p.nps > 1 ? "s" : ""}` : ""}
                </span>
              )}
            </div>
          </article>
        ))}
      </div>

      {postal.trim().length >= 3 && (
        <div className="card watch-card">
          <h3>Get notified when a practice near {postal.trim().toUpperCase()} starts accepting</h3>
          <p className="addr">
            Free. We store your email and postal code, nothing else.
          </p>
          {watchState === "done" ? (
            <p className="watch-done">You are on the list. We will email you when something opens nearby.</p>
          ) : (
            <form className="watch-form" onSubmit={submitWatch}>
              <input
                type="email"
                placeholder="Your email"
                value={watchEmail}
                onChange={(e) => setWatchEmail(e.target.value)}
                required
                className="search-input"
                aria-label="Email for alerts"
              />
              <button
                type="submit"
                className="search-btn"
                disabled={watchState === "submitting"}
              >
                {watchState === "submitting" ? "Saving…" : "Notify me"}
              </button>
              {watchState === "error" && (
                <p className="watch-error">Something went wrong. Try again.</p>
              )}
            </form>
          )}
        </div>
      )}
    </>
  );
}
