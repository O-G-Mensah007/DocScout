/**
 * Source 3: the CPSO Physician Register — practice addresses and telephone
 * numbers.
 *
 * THIS ADAPTER DOES NOT CRAWL THE REGISTER, AND MUST NOT BE MADE TO.
 *
 * What the terms actually say (checked 2026-08-20, quoted in
 * docs/adr/0003-roster-sources-and-entity-resolution.md):
 *
 *  - CPSO operates a formal data-sharing process. It supplies a standardised
 *    dataset — name, CPSO number, primary and secondary practice addresses,
 *    municipality, postal code, telephone, fax, specialty, language of
 *    practice, registration status — to approved requestors, via a written
 *    request form.
 *  - Eligibility is limited to "continuity of care and health resource
 *    management and planning". The College states that research and commercial
 *    requests are not eligible.
 *  - The CPSO website terms of use grant no licence: "Use of CPSO's website
 *    does not grant users ownership, a licence, or any other rights to the
 *    website, its content, or any intellectual property on the website."
 *
 * So there is a sanctioned channel that provides exactly the fields the roster
 * needs, and an eligibility question that is a business decision rather than an
 * engineering one. Scraping the register would route around a process the
 * College built for this purpose — precisely the behaviour invariant 5 exists
 * to prevent us from being able to defend, and precisely the thing a
 * procurement questionnaire will ask about.
 *
 * This adapter therefore reads a file that a human obtained through the
 * official request, and does nothing at all until one exists.
 */
import { readFile } from "node:fs/promises";
import type { RosterCandidate } from "./types";
import { parseCsv } from "./odhf";

export const CPSO_DATA_REQUEST_URL = "https://www.cpso.on.ca/public/services/need-college-data";

export type CpsoLoadResult = {
  candidates: RosterCandidate[];
  /** Set when no operator-supplied extract is configured. */
  skippedReason: string | null;
};

/**
 * Load the CPSO standardised dataset from a local file supplied by an operator.
 *
 * `path` comes from CPSO_REGISTER_EXTRACT_PATH. When it is unset — which is the
 * state this repository ships in — the roster loads without physician-level
 * records and reports the gap, rather than quietly substituting a crawl.
 */
export async function loadCpsoExtract(path: string | undefined): Promise<CpsoLoadResult> {
  if (!path) {
    return {
      candidates: [],
      skippedReason:
        "CPSO_REGISTER_EXTRACT_PATH is not set. The CPSO register is not crawled by " +
        "design; request the standardised dataset at " +
        `${CPSO_DATA_REQUEST_URL} and point this variable at the file.`,
    };
  }

  const text = await readFile(path, "utf8");
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) throw new Error(`CPSO extract at ${path} is empty`);
  const idx = new Map(header.map((h, i) => [h.trim().toLowerCase().replace(/\s+/g, "_"), i]));
  const col = (r: string[], ...names: string[]): string | null => {
    for (const n of names) {
      const i = idx.get(n);
      if (i === undefined) continue;
      const v = (r[i] ?? "").trim();
      if (v !== "") return v;
    }
    return null;
  };

  const retrievedAt = new Date().toISOString();
  const candidates: RosterCandidate[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 2) continue;
    const cpsoNumber = col(r, "cpso_#", "cpso_number", "cpso");
    if (!cpsoNumber) continue;

    candidates.push({
      key: `cpso:${cpsoNumber}`,
      source: "cpso",
      sourceId: cpsoNumber,
      sourceUrl: CPSO_DATA_REQUEST_URL,
      retrievedAt,
      // A physician record is evidence about a practice, not a practice name.
      // The matcher attaches it to the practice at that address; it never
      // becomes a practice called "Dr So-and-so" on its own.
      name: col(r, "practice_name") ?? col(r, "name") ?? "Physician practice",
      altNames: [],
      type: "solo",
      addressLine1: col(r, "primary_practice_address", "practice_address", "address"),
      addressLine2: col(r, "address_2", "secondary_practice_addresses"),
      city: col(r, "municipality", "city"),
      postal: col(r, "postal_code", "postal"),
      lat: null,
      lng: null,
      phone: col(r, "telephone_number", "telephone", "phone"),
      websiteUrl: null,
      orgIdent: null,
      siteRole: null,
    });
  }

  return { candidates, skippedReason: null };
}
