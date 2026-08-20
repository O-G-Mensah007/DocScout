/**
 * Source 2, cross-check only: Statistics Canada's Open Database of Healthcare
 * Facilities (ODHF v1.1), released under the Statistics Canada Open Licence.
 *
 *   https://www.statcan.gc.ca/en/lode/databases/odhf
 *
 * It is 2019–20 vintage and has real coverage gaps: 220-odd Ontario
 * primary-care rows against 585 in the live MOH layer. Its Ontario records are
 * themselves derived from the province's feed, so it is not independent
 * evidence — it is a second transcription of the same underlying list, which is
 * exactly what makes it useful for catching transcription error and nothing else.
 *
 * It therefore never creates a practice. It only attaches to one, and any row
 * it fails to attach is reported rather than loaded. See docs/04-roster.md.
 */
import { inflateRawSync } from "node:zlib";
import type { PracticeType } from "@docscout/core";
import type { RosterCandidate } from "./types";

export const ODHF_ZIP_URL =
  "https://www150.statcan.gc.ca/n1/en/pub/13-26-0001/2020001/ODHF_v1.1.zip";

/** ODHF `source_facility_type` values that correspond to primary care. */
const PRIMARY_CARE_TYPES: Record<string, PracticeType> = {
  "family health team - contract": "FHT",
  "family health team": "FHT",
  "community health centre": "CHC",
  "nurse practitioner led clinic": "NPLC",
  "nurse practitioner-led clinic": "NPLC",
  "aboriginal health access centre": "AHAC",
};

export type OdhfFetchOptions = {
  fetchImpl?: typeof fetch;
  userAgent?: string;
};

export async function fetchOdhf(opts: OdhfFetchOptions = {}): Promise<RosterCandidate[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(ODHF_ZIP_URL, {
    headers: opts.userAgent ? { "user-agent": opts.userAgent } : {},
  });
  if (!res.ok) throw new Error(`ODHF download failed: HTTP ${res.status} ${res.statusText}`);
  const zip = Buffer.from(await res.arrayBuffer());
  const csv = extractCsvFromZip(zip);
  return parseOdhfCsv(csv, new Date().toISOString());
}

/**
 * Minimal ZIP reader for the one CSV in the ODHF archive.
 *
 * StatCan ships the database only as a zip, and this is a handful of lines
 * against pulling in an archive library for a single file. It handles the two
 * storage methods that actually occur (stored and deflate) and refuses anything
 * else loudly rather than returning nonsense.
 */
export function extractCsvFromZip(zip: Buffer): string {
  // Walk local file headers: signature 0x04034b50.
  let off = 0;
  while (off + 30 <= zip.length) {
    if (zip.readUInt32LE(off) !== 0x04034b50) break;
    const method = zip.readUInt16LE(off + 8);
    const flags = zip.readUInt16LE(off + 6);
    let compSize = zip.readUInt32LE(off + 18);
    let uncompSize = zip.readUInt32LE(off + 22);
    const nameLen = zip.readUInt16LE(off + 26);
    const extraLen = zip.readUInt16LE(off + 28);
    const name = zip.subarray(off + 30, off + 30 + nameLen).toString("latin1");
    const dataStart = off + 30 + nameLen + extraLen;

    if ((flags & 0x08) !== 0 && compSize === 0) {
      // Sizes live in a trailing data descriptor. Fall back to the central
      // directory rather than guessing.
      ({ compSize, uncompSize } = sizesFromCentralDirectory(zip, name));
    }

    if (name.toLowerCase().endsWith(".csv")) {
      const data = zip.subarray(dataStart, dataStart + compSize);
      const raw = method === 0 ? data : method === 8 ? inflateRawSync(data) : null;
      if (raw === null) {
        throw new Error(`ODHF zip: unsupported compression method ${method} for ${name}`);
      }
      if (uncompSize && raw.length !== uncompSize) {
        throw new Error(`ODHF zip: ${name} inflated to ${raw.length}, expected ${uncompSize}`);
      }
      // The file is Latin-1 encoded (accented Franco-Ontarian facility names).
      return raw.toString("latin1");
    }
    off = dataStart + compSize;
  }
  throw new Error("ODHF zip: no .csv entry found");
}

function sizesFromCentralDirectory(
  zip: Buffer,
  wantName: string,
): { compSize: number; uncompSize: number } {
  for (let i = zip.length - 46; i >= 0; i--) {
    if (zip.readUInt32LE(i) !== 0x02014b50) continue;
    const nameLen = zip.readUInt16LE(i + 28);
    const name = zip.subarray(i + 46, i + 46 + nameLen).toString("latin1");
    if (name === wantName) {
      return { compSize: zip.readUInt32LE(i + 20), uncompSize: zip.readUInt32LE(i + 24) };
    }
  }
  throw new Error(`ODHF zip: ${wantName} not found in central directory`);
}

/** RFC 4180 CSV parse — quoted fields with embedded commas and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    if (ch === "\r") continue;
    field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

export function parseOdhfCsv(csv: string, retrievedAt: string): RosterCandidate[] {
  const rows = parseCsv(csv);
  const header = rows[0];
  if (!header) throw new Error("ODHF csv: empty file");
  const idx = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
  const col = (r: string[], name: string): string | null => {
    const i = idx.get(name);
    if (i === undefined) return null;
    const v = (r[i] ?? "").trim();
    return v === "" ? null : v;
  };

  const out: RosterCandidate[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 3) continue;
    if ((col(r, "province") ?? "").toLowerCase() !== "on") continue;

    const facilityType = (col(r, "source_facility_type") ?? "").toLowerCase();
    const mapped = PRIMARY_CARE_TYPES[facilityType];
    if (!mapped) continue;

    const streetNo = col(r, "street_no");
    const streetName = col(r, "street_name");
    const line1 = [streetNo, streetName].filter(Boolean).join(" ") || null;
    const lat = Number(col(r, "latitude"));
    const lng = Number(col(r, "longitude"));
    const id = col(r, "index") ?? String(i);

    out.push({
      key: `statcan_odhf:${id}`,
      source: "statcan_odhf",
      sourceId: id,
      sourceUrl: ODHF_ZIP_URL,
      retrievedAt,
      name: col(r, "facility_name") ?? "Unnamed facility",
      altNames: [],
      type: mapped,
      addressLine1: line1,
      addressLine2: col(r, "unit"),
      city: col(r, "city"),
      postal: col(r, "postal_code"),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      phone: null,
      websiteUrl: null,
      orgIdent: null,
      siteRole: null,
    });
  }
  return out;
}
