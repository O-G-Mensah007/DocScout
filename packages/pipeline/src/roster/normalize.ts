/**
 * Pure normalisation helpers for roster entity resolution.
 *
 * Everything here is a pure function of its arguments: no I/O, no clock, no
 * randomness. That is deliberate — the matcher is the component whose bugs are
 * invisible (a wrong merge silently corrupts every layer above it), so it has
 * to be testable without a network or a database.
 *
 * The shapes these functions have to survive are drawn from real rows in the
 * two live sources, not from imagination:
 *
 *   MOH  "721 Front Road South"   ODHF "721 front road s"
 *   MOH  "Bridgepoint Family Health Team"   ODHF "Bridgepoint Fht"
 *   MOH  "227 Algonquin Boulevard West", ADDRESS_LINE_2 "Suites 3 &4"
 */

/** Canonical postal form: uppercase, no spaces. `null` when unusable. */
export function normalizePostal(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(s) ? s : null;
}

/** Forward sortation area — the first three characters of a postal code. */
export function postalFsa(raw: string | null | undefined): string | null {
  const p = normalizePostal(raw);
  return p ? p.slice(0, 3) : null;
}

/**
 * Ten-digit NANP form. Extensions are dropped: two listings of the same front
 * desk routinely differ only by extension, so keeping it would split matches.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // "416-555-0100 ext. 240", "416-555-0100 x240" — the extension is not part of
  // the front desk's identity, and keeping it would split two listings of one.
  const head = raw.replace(/(?:\bext(?:ension)?\b\.?|\bx\.?)\s*\d+\s*$/i, "");
  let d = head.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return null;
  // NANP area and exchange codes both start 2-9.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(d)) return null;
  return d;
}

const STREET_TYPES: Record<string, string> = {
  st: "street", str: "street", rd: "road", ave: "avenue", av: "avenue",
  blvd: "boulevard", boul: "boulevard", dr: "drive", cres: "crescent",
  cr: "crescent", ct: "court", crt: "court", pl: "place", ln: "lane",
  hwy: "highway", pkwy: "parkway", pky: "parkway", ter: "terrace",
  tr: "trail", trl: "trail", sq: "square", cir: "circle", gdns: "gardens",
  hts: "heights", rr: "rural route", conc: "concession", sdrd: "sideroad",
};

const DIRECTIONS: Record<string, string> = {
  n: "north", s: "south", e: "east", w: "west",
  ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest",
  no: "north", su: "south",
};

/** Practice-name abbreviations that are genuinely equivalent in this domain. */
const NAME_EXPANSIONS: Array<[RegExp, string]> = [
  [/\bfht\b/g, "family health team"],
  [/\bchc\b/g, "community health centre"],
  [/\bnplc\b/g, "nurse practitioner led clinic"],
  [/\bahac\b/g, "aboriginal health access centre"],
  [/\bfho\b/g, "family health organization"],
  [/\bchs\b/g, "community health services"],
  [/\bcsc\b/g, "centre de sante communautaire"],
  [/\bctr\b/g, "centre"],
  [/\bcenter\b/g, "centre"],
  [/\bcentre?s\b/g, "centre"],
  [/\bhosp\b/g, "hospital"],
  [/\bassoc\b/g, "association"],
  [/\bsvcs?\b/g, "services"],
  [/\bmed\b/g, "medical"],
  [/\bdept\b/g, "department"],
  [/\bst\b/g, "saint"],
];

/** Tokens that carry no discriminating power between Ontario practices. */
const NAME_STOPWORDS = new Set([
  "the", "of", "and", "at", "in", "for", "a", "an", "de", "du", "la", "le",
  "les", "des", "inc", "ltd", "on", "ontario",
]);

/** Strip accents and punctuation, collapse whitespace, lowercase. */
function foldText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export type ParsedName = {
  /** The organisation, with site qualifiers and aliases removed. */
  base: string;
  /** e.g. "danforth site", "fifth avenue site" — distinguishes sibling sites. */
  siteQualifier: string | null;
  /** Parenthetical and "formerly ..." names, kept for matching but not display. */
  aliases: string[];
};

/**
 * Split a source name into the organisation, its site qualifier, and aliases.
 *
 * This split is what stops "Timmins Academic Family Health Team-Toke Street
 * Site" from being merged into "Timmins Academic Family Health Team". They are
 * two front desks a patient would phone separately, and the roster resolves to
 * the front desk.
 */
export function parseName(raw: string | null | undefined): ParsedName {
  if (!raw) return { base: "", siteQualifier: null, aliases: [] };

  const aliases: string[] = [];
  // Parentheticals are aliases: "(Formerly Anne Johnston Health Station)".
  let work = raw.replace(/\(([^)]*)\)/g, (_m, inner: string) => {
    const cleaned = inner.replace(/^\s*(formerly|previously|prev\.?|aka)\s+/i, "").trim();
    if (cleaned) aliases.push(normalizeName(cleaned));
    return " ";
  });

  let siteQualifier: string | null = null;
  // " - Danforth Site" / "-Toke Street Site" / " – Main Campus"
  const sitePattern = /[-–—]\s*([^-–—]*\b(?:site|campus|location|clinic|branch|office|satellite|annex)\b[^-–—]*)$/i;
  const m = sitePattern.exec(work);
  if (m?.[1]) {
    siteQualifier = normalizeName(m[1]);
    work = work.slice(0, m.index);
  }

  return { base: normalizeName(work), siteQualifier, aliases: aliases.filter(Boolean) };
}

/** Fold a practice name and expand domain abbreviations. */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = foldText(raw);
  for (const [re, to] of NAME_EXPANSIONS) s = s.replace(re, to);
  return s.replace(/\s+/g, " ").trim();
}

/** Discriminating tokens of a normalised name, de-duplicated and sorted. */
export function nameTokens(raw: string | null | undefined): string[] {
  const t = normalizeName(raw).split(" ").filter((w) => w && !NAME_STOPWORDS.has(w));
  return [...new Set(t)].sort();
}

export type ParsedAddress = {
  /** Leading civic number, e.g. "721", "10B". `null` for "Rue Low Street". */
  streetNumber: string | null;
  /** The civic number without its unit letter: "10B" -> "10". */
  streetNumberBase: string | null;
  /** Expanded street name including type and direction: "front road south". */
  streetName: string;
  /** Suite/unit when the source separates it, e.g. "suite 208". */
  unit: string | null;
};

/**
 * Parse a civic address into number / street / unit.
 *
 * `line2` in the MOH feed is a grab-bag: sometimes a suite ("Suites 3 &4"),
 * sometimes a mailing address ("Postal Office Box 1240"). PO boxes are dropped
 * — they are not the front desk and matching on them creates false merges.
 */
export function parseAddress(
  line1: string | null | undefined,
  line2?: string | null | undefined,
): ParsedAddress {
  const primary = (line1 ?? "").trim();
  let streetNumber: string | null = null;
  let rest = primary;

  // Leading civic number, optionally hyphenated or lettered: "12", "12A", "12-14".
  const numMatch = /^\s*(\d+[a-zA-Z]?(?:\s*-\s*\d+[a-zA-Z]?)?)\s+(.*)$/.exec(primary);
  if (numMatch?.[1] && numMatch[2]) {
    streetNumber = numMatch[1].replace(/\s*-\s*/, "-").toUpperCase();
    rest = numMatch[2];
  }

  // Sources disagree about where the unit belongs. The province puts it in
  // ADDRESS_LINE_2 ("Unit 2"); ODHF appends it to the street ("markham rd unit
  // 2"). Pull it out of the street either way, or the two spellings of one
  // address stop looking alike.
  const streetName = normalizeStreetName(stripTrailingUnit(rest));
  const unit = parseUnit(line2) ?? parseUnit(primary);
  return { streetNumber, streetNumberBase: civicBase(streetNumber), streetName, unit };
}

/** Remove a trailing "unit 2" / "suite 208" / "#4" from a street name. */
function stripTrailingUnit(raw: string): string {
  return raw
    .replace(
      /[\s,-]+(?:unit|suite|ste|apt|apartment|room|rm|floor|fl|level|#)\s*[a-z0-9&,\s-]{0,12}$/i,
      "",
    )
    .replace(/[\s,-]+#\s*\S+$/i, "")
    .trim();
}

/**
 * Strip a trailing unit letter from a civic number.
 *
 * "10B Victoria Street South" and "10 Victoria Street S" are one building with
 * one front desk; the letter is a unit designator that one source keeps and the
 * other drops. Compare bases, never the raw string, when weighing two sources
 * against each other.
 */
export function civicBase(streetNumber: string | null): string | null {
  if (!streetNumber) return null;
  const m = /^(\d+)[a-zA-Z]?$/.exec(streetNumber);
  return m?.[1] ?? streetNumber;
}

function parseUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = foldText(raw);
  if (!s) return null;
  if (/\b(po|postal)\b.*\bbox\b|\bbox\b\s*\d+/.test(s)) return null;
  const m = /\b(?:suite|suites|unit|apt|apartment|room|rm|ste|floor|fl|level)\b\s*([a-z0-9 &,-]{1,24})/.exec(s);
  if (m?.[1]) return `suite ${m[1].replace(/[,&]/g, " ").replace(/\s+/g, " ").trim()}`;
  return null;
}

/**
 * Canonicalise a street name: expand type and direction abbreviations so that
 * "Front Road South" and "front road s" reduce to the same string.
 *
 * "St" is ambiguous. Leading "St" is Saint ("St Clair", "St Jacobs"); anywhere
 * else it is Street. That rule holds across every Ontario address in both feeds.
 */
export function normalizeStreetName(raw: string | null | undefined): string {
  if (!raw) return "";
  const folded = foldText(raw);
  if (!folded) return "";
  const words = folded.split(" ");
  const out: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w) continue;
    const isFirst = i === 0;
    const isLast = i === words.length - 1;

    if (w === "st") {
      out.push(isFirst ? "saint" : "street");
      continue;
    }
    // Directions only count at the end, where they are genuinely directional.
    // "west" in "West Street" is part of the name; in "Algonquin Blvd W" it is not.
    if (isLast && DIRECTIONS[w] !== undefined) {
      out.push(DIRECTIONS[w]);
      continue;
    }
    out.push(STREET_TYPES[w] ?? w);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

/** Dice coefficient over token sets. 1 = identical sets, 0 = disjoint. */
export function tokenSimilarity(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let shared = 0;
  for (const t of new Set(a)) if (setB.has(t)) shared++;
  return (2 * shared) / (new Set(a).size + setB.size);
}

/** Similarity between two street names, on their token sets. */
export function streetSimilarity(a: string, b: string): number {
  const ta = a.split(" ").filter(Boolean);
  const tb = b.split(" ").filter(Boolean);
  return tokenSimilarity(ta, tb);
}

/** Great-circle distance in kilometres. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Title Case for display, preserving the source's intent. */
export function titleCase(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}
