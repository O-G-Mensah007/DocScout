/**
 * Source 1, highest trust: the Ontario Ministry of Health service provider
 * locations, published through Land Information Ontario as an ESRI REST layer.
 *
 *   https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/
 *     LIO_OPEN_DATA/LIO_Open09/MapServer/26
 *
 * Licence: Open Government Licence – Ontario, declared in the layer's
 * `copyrightText`. Attribution is required and is rendered on the bot page.
 *
 * This is the authoritative roster of *funded team-based* primary care. Note
 * what it does not contain: no telephone number, no website, and no solo or
 * group family practices (FHO/FHG). See docs/04-roster.md.
 */
import type { PracticeType } from "@docscout/core";
import type { RosterCandidate } from "./types";

export const MOH_LIO_LAYER_URL =
  "https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open09/MapServer/26";

/**
 * The service types that are primary-care attachment points — places where a
 * patient can be rostered to a provider. Hospitals, pharmacies, labs, long-term
 * care and mental-health organisations are all in this layer and all excluded:
 * they are not somewhere you get a family doctor.
 */
export const PRIMARY_CARE_SERVICE_TYPES = [
  "Family Health Team",
  "Community Health Centre",
  "Nurse Practitioner-Led Clinic",
  "Indigenous Primary Health Care Organization",
] as const;

const TYPE_MAP: Record<string, PracticeType> = {
  "Family Health Team": "FHT",
  "Community Health Centre": "CHC",
  "Nurse Practitioner-Led Clinic": "NPLC",
  "Indigenous Primary Health Care Organization": "AHAC",
};

type EsriFeature = {
  attributes: Record<string, string | number | null>;
  geometry?: { x: number; y: number } | null;
};

type EsriResponse = {
  features?: EsriFeature[];
  exceededTransferLimit?: boolean;
  error?: { message?: string; details?: string[] };
};

function str(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export type FetchOptions = {
  /** Injected in tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  pageSize?: number;
  userAgent?: string;
};

/**
 * Fetch every primary-care location in the layer, paging through ESRI's
 * `maxRecordCount` (2000). Paged rather than assumed: the layer grows.
 */
export async function fetchMohLio(opts: FetchOptions = {}): Promise<RosterCandidate[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const pageSize = opts.pageSize ?? 1000;
  const retrievedAt = new Date().toISOString();
  const where = `SERVICE_TYPE IN (${PRIMARY_CARE_SERVICE_TYPES.map((t) => `'${t}'`).join(",")})`;

  const out: RosterCandidate[] = [];
  let offset = 0;

  for (;;) {
    const params = new URLSearchParams({
      where,
      outFields: "*",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      orderByFields: "OGF_ID ASC",
    });
    const url = `${MOH_LIO_LAYER_URL}/query?${params.toString()}`;

    const res = await doFetch(url, {
      headers: {
        accept: "application/json",
        ...(opts.userAgent ? { "user-agent": opts.userAgent } : {}),
      },
    });
    if (!res.ok) {
      throw new Error(`MOH LIO query failed: HTTP ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as EsriResponse;
    if (body.error) {
      throw new Error(
        `MOH LIO query error: ${body.error.message ?? "unknown"} ${(body.error.details ?? []).join("; ")}`,
      );
    }
    const features = body.features ?? [];
    for (const f of features) out.push(toCandidate(f, retrievedAt));

    if (features.length < pageSize) break;
    offset += features.length;
    if (offset > 100_000) throw new Error("MOH LIO paging did not terminate");
  }

  return out;
}

function toCandidate(f: EsriFeature, retrievedAt: string): RosterCandidate {
  const a = f.attributes;
  const ogfId = str(a.OGF_ID) ?? str(a.OBJECTID) ?? "unknown";
  const serviceType = str(a.SERVICE_TYPE) ?? "";
  const name = str(a.ENGLISH_NAME) ?? str(a.FRENCH_NAME) ?? "Unnamed location";

  const altNames = [
    str(a.ENGLISH_NAME_ALT),
    str(a.FRENCH_NAME),
    str(a.FRENCH_NAME_ALT),
  ].filter((x): x is string => x !== null && x !== name);

  return {
    key: `moh_lio:${ogfId}`,
    source: "moh_lio",
    sourceId: ogfId,
    sourceUrl: MOH_LIO_LAYER_URL,
    retrievedAt,
    name,
    altNames,
    type: TYPE_MAP[serviceType] ?? "other",
    addressLine1: str(a.ADDRESS_LINE_1),
    addressLine2: str(a.ADDRESS_LINE_2) ?? str(a.ADDRESS_DESCRIPTOR),
    city: str(a.COMMUNITY),
    postal: str(a.POSTAL_CODE),
    lat: f.geometry ? f.geometry.y : null,
    lng: f.geometry ? f.geometry.x : null,
    // Neither of the two open sources publishes a telephone number or a
    // website. Both stay null until the CPSO question is resolved.
    phone: null,
    websiteUrl: null,
    orgIdent: str(a.MOH_SERVICE_PROVIDER_IDENT),
    siteRole: str(a.SERVICE_TYPE_DETAIL),
  };
}
