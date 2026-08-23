/**
 * Source 4: AFHTO "Find A Team" — the Association of Family Health Teams of
 * Ontario publishes a directory of all team-based primary care organisations
 * in Ontario at https://www.afhto.ca/find-a-team.
 *
 * The page embeds a JSON array in a `data-locations` attribute on the map
 * element: each entry carries lat/lng, title, type, and an HTML `description`
 * containing address, municipality, phone, and (usually) website URL.
 *
 * The HTML table rows carry the same data with the website linked from the
 * organisation name. The JSON payload is more reliable to parse (no nested
 * HTML tables), so we read that.
 *
 * Coverage (as of 2026-08-22): 328 teams, 100% phone, 99% website, 100%
 * address, 100% geocoded. This is the only open source that publishes both
 * phone and website for team-based primary care.
 *
 * Like ODHF, AFHTO never creates a practice — it enriches existing MOH
 * records with phone and website. A lone AFHTO row that matches nothing is
 * reported, not loaded.
 */
import type { PracticeType } from "@docscout/core";
import type { RosterCandidate } from "./types";

export const AFHTO_PAGE_URL = "https://www.afhto.ca/find-a-team";

const TYPE_MAP: Record<string, PracticeType> = {
  FHT: "FHT",
  IFHT: "FHT",
  CHC: "CHC",
  NPLC: "NPLC",
  AHAC: "AHAC",
  IIPCT: "other",
  OTHER: "other",
};

type AfhtoLocation = {
  lat: number;
  lng: number;
  title: string;
  description: string;
  type: string;
  icon?: string;
};

export type AfhtoFetchOptions = {
  fetchImpl?: typeof fetch;
  userAgent?: string;
};

export async function fetchAfhto(
  opts: AfhtoFetchOptions = {},
): Promise<RosterCandidate[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(AFHTO_PAGE_URL, {
    headers: {
      accept: "text/html",
      ...(opts.userAgent ? { "user-agent": opts.userAgent } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`AFHTO fetch failed: HTTP ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  return parseAfhtoPage(html, new Date().toISOString());
}

/**
 * Extract the JSON payload from the `data-locations` attribute on the map
 * element. This is the structured data that drives the Leaflet map on the
 * Find A Team page.
 */
export function extractLocationsJson(html: string): AfhtoLocation[] {
  const match = html.match(/data-locations='([^']+)'/);
  if (!match) {
    throw new Error(
      "AFHTO page: could not find data-locations attribute — page structure may have changed",
    );
  }
  const captured = match[1];
  if (!captured) {
    throw new Error("AFHTO page: data-locations attribute is empty");
  }
  const raw = captured
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—");
  return JSON.parse(raw) as AfhtoLocation[];
}

/**
 * Parse a field value from the HTML description embedded in each location's
 * `description` property. Format is `<p><strong>Label:</strong> value</p>`.
 */
function descriptionField(desc: string, label: string): string | null {
  const re = new RegExp(
    `<strong>${escapeRegex(label)}:?</strong>\\s*(.+?)(?:</p>|$)`,
    "i",
  );
  const m = desc.match(re);
  if (!m?.[1]) return null;
  const v = m[1].trim();
  return v === "" ? null : v;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract a website URL from the description. The website field contains an
 * `<a href="...">` tag when present.
 */
function extractWebsite(desc: string): string | null {
  const field = descriptionField(desc, "Website");
  if (!field) return null;
  const linkMatch = field.match(/href="([^"]+)"/);
  if (linkMatch?.[1]) return linkMatch[1];
  const bare = field.replace(/<[^>]+>/g, "").trim();
  if (bare.startsWith("http")) return bare;
  return null;
}

/**
 * Extract a phone number from the description. Returns the raw digits+dashes
 * string — normalisation happens in the matcher.
 */
function extractPhone(desc: string): string | null {
  const field = descriptionField(desc, "Phone Number");
  if (!field) return null;
  return field.replace(/<[^>]+>/g, "").trim() || null;
}

/**
 * Extract the address from the description.
 */
function extractAddress(desc: string): string | null {
  const field = descriptionField(desc, "Address");
  if (!field) return null;
  return field.replace(/<[^>]+>/g, "").trim() || null;
}

/**
 * Extract the municipality from the description.
 * Note: AFHTO stores municipality as a numeric code in some entries.
 */
function extractMunicipality(desc: string): string | null {
  const field = descriptionField(desc, "Municipality");
  if (!field) return null;
  const text = field.replace(/<[^>]+>/g, "").trim();
  if (text === "" || /^\d+$/.test(text)) return null;
  return text;
}

export function parseAfhtoPage(
  html: string,
  retrievedAt: string,
): RosterCandidate[] {
  const locations = extractLocationsJson(html);
  const out: RosterCandidate[] = [];

  for (let i = 0; i < locations.length; i++) {
    const entry = locations[i]!;
    const practiceType = TYPE_MAP[entry.type] ?? "other";
    const address = extractAddress(entry.description);
    const phone = extractPhone(entry.description);
    const website = extractWebsite(entry.description);
    const municipality = extractMunicipality(entry.description);

    const sourceId = `${i}:${slugify(entry.title)}`;

    out.push({
      key: `afhto:${sourceId}`,
      source: "afhto",
      sourceId,
      sourceUrl: AFHTO_PAGE_URL,
      retrievedAt,
      name: entry.title,
      altNames: [],
      type: practiceType,
      addressLine1: address,
      addressLine2: null,
      city: municipality,
      postal: null,
      lat: Number.isFinite(entry.lat) ? entry.lat : null,
      lng: Number.isFinite(entry.lng) ? entry.lng : null,
      phone,
      websiteUrl: website,
      orgIdent: null,
      siteRole: null,
    });
  }

  return out;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
