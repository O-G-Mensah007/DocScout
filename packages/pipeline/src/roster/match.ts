/**
 * Entity resolution for the roster.
 *
 * The unit we resolve to is the **practice**: the front desk a patient
 * actually contacts. That choice decides most of the hard cases:
 *
 *   - "Bridgepoint Family Health Team" (MOH) and "Bridgepoint Fht" (ODHF) at
 *     430 Broadview Avenue are one practice. Merge.
 *   - "Timmins Academic Family Health Team" at 123 Third Avenue and "Timmins
 *     Academic Family Health Team-Toke Street Site" at 247 Toke Street are two
 *     practices. Two phone numbers, two waiting rooms, two panels. Do not merge,
 *     however similar the names are.
 *
 * Everything in this file is pure. `scorePair` is a function of two candidates
 * and nothing else; `resolveEntities` is a function of a candidate list. No
 * clock, no network, no database.
 *
 * The output has three buckets, never two. Anything the evidence does not
 * clearly resolve goes to `needs_review` and is left unmerged — a human decides.
 * Lowering the threshold to shrink that bucket is the one change that must not
 * be made here; it converts visible uncertainty into invisible corruption.
 */
import {
  haversineKm,
  nameTokens,
  normalizePhone,
  normalizePostal,
  parseAddress,
  parseName,
  streetSimilarity,
  tokenSimilarity,
} from "./normalize";

/** A source record reduced to the fields the matcher is allowed to see. */
export type MatchCandidate = {
  /** Unique within a run: `${source}:${sourceId}`. */
  key: string;
  /**
   * Which feed this row came from. The matcher needs it because same-source and
   * cross-source disagreements mean opposite things — see `scorePair`.
   */
  source: string;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postal: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
};

export type MatchSignals = {
  /** `null` when either side lacks a usable postal code. */
  postalEqual: boolean | null;
  streetNumberEqual: boolean | null;
  streetNameSimilarity: number | null;
  unitConflict: boolean;
  geoDistanceKm: number | null;
  phoneEqual: boolean | null;
  nameSimilarity: number;
  /** Two different named sites of the same organisation. */
  siteQualifierConflict: boolean;
};

export type MatchDecision = "merge" | "review" | "distinct";

export type MatchResult = {
  /** 0..1. Confidence that these two rows are the same front desk. */
  score: number;
  decision: MatchDecision;
  signals: MatchSignals;
  /** Human-readable account of what drove the decision. Shown in the review queue. */
  reasons: string[];
};

/**
 * Thresholds.
 *
 * These are the numbers a future maintainer will be tempted to move. See
 * docs/adr/0003-roster-sources-and-entity-resolution.md before touching them:
 * the correct response to a large review bucket is a better signal, not a
 * lower bar.
 */
export const MERGE_THRESHOLD = 0.9;
export const REVIEW_THRESHOLD = 0.6;

/** Two addresses closer than this are the same building for our purposes. */
const SAME_BUILDING_KM = 0.06;
/** Beyond this, no amount of name similarity makes them one front desk. */
const DIFFERENT_PLACE_KM = 1.0;
/** How close two same-named addresses must be to read as a relocation. */
const RELOCATION_KM = 0.5;
const RELOCATION_NAME_SIMILARITY = 0.8;
/** Above this, two names are the same organisation rather than two tenants. */
const SAME_ORG_NAME_SIMILARITY = 0.85;

function decide(score: number): MatchDecision {
  if (score >= MERGE_THRESHOLD) return "merge";
  if (score >= REVIEW_THRESHOLD) return "review";
  return "distinct";
}

/**
 * Score one pair. Pure.
 *
 * Location is the spine of the decision and name is corroboration — never the
 * reverse. Sibling sites of one FHT share a name almost exactly, so a
 * name-weighted matcher merges them and destroys the roster.
 */
export function scorePair(a: MatchCandidate, b: MatchCandidate): MatchResult {
  const reasons: string[] = [];

  const pa = parseAddress(a.addressLine1, a.addressLine2);
  const pb = parseAddress(b.addressLine1, b.addressLine2);
  const postalA = normalizePostal(a.postal);
  const postalB = normalizePostal(b.postal);
  const phoneA = normalizePhone(a.phone);
  const phoneB = normalizePhone(b.phone);
  const nameA = parseName(a.name);
  const nameB = parseName(b.name);

  const postalEqual = postalA && postalB ? postalA === postalB : null;
  // Two rows from the *same* feed that differ at all are two places the
  // publisher deliberately lists separately. Two rows from *different* feeds
  // are one reality transcribed twice, so a unit letter is noise.
  const sameSource = a.source === b.source;
  const streetNumberEqual =
    pa.streetNumber && pb.streetNumber
      ? sameSource
        ? pa.streetNumber === pb.streetNumber
        : pa.streetNumberBase === pb.streetNumberBase
      : null;
  const streetNameSimilarity =
    pa.streetName && pb.streetName ? streetSimilarity(pa.streetName, pb.streetName) : null;
  const phoneEqual = phoneA && phoneB ? phoneA === phoneB : null;

  const geoDistanceKm =
    a.lat !== null && a.lng !== null && b.lat !== null && b.lng !== null
      ? haversineKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng })
      : null;

  // Compare aliases too: "Vibrant Health Care Alliance (Formerly Anne Johnston
  // Health Station)" must be able to match "Anne Johnston Health Station".
  const nameSimilarity = bestNameSimilarity(a.name, b.name);

  const siteQualifierConflict =
    nameA.siteQualifier !== null &&
    nameB.siteQualifier !== null &&
    nameA.siteQualifier !== nameB.siteQualifier;

  const unitConflict = pa.unit !== null && pb.unit !== null && pa.unit !== pb.unit;

  const signals: MatchSignals = {
    postalEqual,
    streetNumberEqual,
    streetNameSimilarity,
    unitConflict,
    geoDistanceKm,
    phoneEqual,
    nameSimilarity,
    siteQualifierConflict,
  };

  const sameStreet = streetNameSimilarity !== null && streetNameSimilarity >= 0.9;
  const sameBuilding = geoDistanceKm !== null && geoDistanceKm <= SAME_BUILDING_KM;
  const sameCivicAddress = streetNumberEqual === true && sameStreet;

  // ---- Phone, consulted before address.
  //
  // A telephone number *is* the front desk — the one thing in the record that a
  // patient actually uses, and the only field that distinguishes two tenants of
  // one building. Address cannot do that job: a medical office building gives
  // thirty unrelated practices the same civic number, the same postal code and
  // the same coordinates, differing only by a suite that half the sources drop.
  //
  // So phone is checked first and, where both sides have one, it decides.
  const locationCompatible =
    postalEqual === true ||
    sameCivicAddress ||
    sameBuilding ||
    (geoDistanceKm !== null && geoDistanceKm <= DIFFERENT_PLACE_KM);

  if (phoneEqual === true && locationCompatible) {
    reasons.push("same phone number at a compatible location");
    if (unitConflict) {
      reasons.push(`recorded under different suites (${pa.unit} vs ${pb.unit}) — one front desk`);
    }
    const score = Math.min(1, 0.95 + 0.05 * nameSimilarity);
    return { score, decision: decide(score), signals, reasons };
  }

  if (phoneEqual === false) {
    // Two numbers at one address. A suite difference settles it: different
    // suite *and* different line is two tenants, not one practice recorded
    // twice. Without a suite we cannot rule out a main line and a department
    // line for the same front desk, so a human looks.
    if (sameCivicAddress || sameBuilding) {
      if (unitConflict) {
        reasons.push(
          `different suites (${pa.unit} vs ${pb.unit}) and different phone numbers ` +
            `— two practices in one building`,
        );
        return { score: 0.05, decision: "distinct", signals, reasons };
      }
      reasons.push(
        "same address but different phone numbers, with no suite to tell them apart",
      );
      const score = clamp(0.6 + 0.05 * nameSimilarity);
      return { score, decision: decide(score), signals, reasons };
    }
    reasons.push("different phone numbers and no address agreement");
    return { score: 0.1, decision: "distinct", signals, reasons };
  }

  // ---- Written address agreement, checked before anything geographic.
  //
  // A Canadian postal code is building-precise. Agreeing on civic number,
  // street and postal code is therefore about as strong as evidence gets, and
  // it outranks a geocode disagreement: bad geocodes are common, while two
  // different clinics sharing all three is close to impossible. ODHF places
  // "629 markham rd unit 2, M1H 2A4" 2.4 km from where the province puts the
  // same address — trusting the coordinate there would split one practice in two.
  if (streetNumberEqual === true && sameStreet && postalEqual === true) {
    reasons.push("same civic address and postal code");
    if (geoDistanceKm !== null && geoDistanceKm > DIFFERENT_PLACE_KM) {
      reasons.push(
        `geocodes disagree by ${geoDistanceKm.toFixed(2)} km — treated as a geocoding error`,
      );
    }
    if (siteQualifierConflict) {
      reasons.push(
        `different site qualifiers ("${nameA.siteQualifier}" vs "${nameB.siteQualifier}") at one address`,
      );
      return { score: 0.75, decision: "review", signals, reasons };
    }
    if (unitConflict) return suiteVerdict(pa.unit, pb.unit, nameSimilarity, signals, reasons);
    const score = clamp(0.9 + 0.1 * nameSimilarity);
    return { score, decision: decide(score), signals, reasons };
  }

  // ---- Hard exclusions. Evidence that two rows are different places is
  // ---- stronger than any evidence that they are the same one.

  if (geoDistanceKm !== null && geoDistanceKm > DIFFERENT_PLACE_KM) {
    reasons.push(`${geoDistanceKm.toFixed(2)} km apart — different places`);
    return { score: 0, decision: "distinct", signals, reasons };
  }

  if (streetNumberEqual === false) {
    // Different civic numbers. Only geocodes that land on the same building
    // can rescue this (data-entry variants like "12" vs "12-14").
    if (geoDistanceKm !== null && geoDistanceKm <= SAME_BUILDING_KM) {
      reasons.push("different civic number but geocodes to the same building");
    } else if (
      !sameSource &&
      nameSimilarity >= RELOCATION_NAME_SIMILARITY &&
      geoDistanceKm !== null &&
      geoDistanceKm <= RELOCATION_KM
    ) {
      // One organisation, a few hundred metres away, at a different civic
      // number, in two feeds of different vintage. Nearly always a relocation —
      // "South East Toronto FHT" is at 840 Coxwell now and was at 833 Coxwell in
      // 2019. Occasionally it is two genuine sites. We cannot tell without a
      // phone number, so a human decides; merging on our own would either
      // invent a duplicate or hide a practice.
      //
      // Deliberately not reachable for two rows of the same feed: the province
      // listing 38 Pine Street and 206 Fifth Avenue at the same time means
      // Timmins Academic FHT runs two clinics, not that it moved.
      reasons.push(
        `same organisation ${Math.round(geoDistanceKm * 1000)} m away at a different ` +
          `civic number (${pa.streetNumber} vs ${pb.streetNumber}) — possible relocation`,
      );
      const score = 0.72;
      return { score, decision: decide(score), signals, reasons };
    } else {
      reasons.push(
        `different civic number (${pa.streetNumber} vs ${pb.streetNumber})` +
          (sameSource ? " — one feed listing two locations" : ""),
      );
      return { score: 0.05, decision: "distinct", signals, reasons };
    }
  }

  // ---- Address, where phone was unavailable or inconclusive.

  // Civic address agreement where the postal codes are absent or disagree.
  // (The both-agree case returned above.)
  if (streetNumberEqual === true && sameStreet) {
    if (postalEqual === false && !sameBuilding) {
      reasons.push("same civic address but conflicting postal codes");
      const score = 0.7 + 0.1 * nameSimilarity;
      return { score, decision: decide(score), signals, reasons };
    }
    reasons.push("same civic address");
    if (sameBuilding) reasons.push("geocodes to the same building");

    // Two named sites at one address is a real pattern (a clinic and its
    // satellite in the same medical building). Send it to a human.
    if (siteQualifierConflict) {
      reasons.push(
        `different site qualifiers ("${nameA.siteQualifier}" vs "${nameB.siteQualifier}") at one address`,
      );
      const score = 0.75;
      return { score, decision: decide(score), signals, reasons };
    }

    if (unitConflict) return suiteVerdict(pa.unit, pb.unit, nameSimilarity, signals, reasons);
    const score = clamp(0.9 + 0.1 * nameSimilarity);
    return { score, decision: decide(score), signals, reasons };
  }

  // Same civic number, same postal, but the street names disagree. This is the
  // "16 Station Street" vs "16 Billa Street" shape: one of the two sources has
  // it wrong and we cannot tell which. Never auto-merge it.
  if (streetNumberEqual === true && postalEqual === true) {
    reasons.push(
      `same civic number and postal code but different street names ` +
        `("${pa.streetName}" vs "${pb.streetName}")`,
    );
    const score = clamp(0.62 + 0.12 * nameSimilarity);
    return { score, decision: decide(score), signals, reasons };
  }

  // Geocodes agree to the building but the text does not.
  if (sameBuilding) {
    reasons.push(`geocodes ${Math.round((geoDistanceKm ?? 0) * 1000)} m apart`);
    if (siteQualifierConflict) {
      reasons.push("different named sites in one building");
      return { score: 0.7, decision: "review", signals, reasons };
    }
    const score = clamp(0.68 + 0.22 * nameSimilarity);
    return { score, decision: decide(score), signals, reasons };
  }

  // Nothing but the name. Never enough on its own — Ontario has many
  // identically named sites of the same organisation in different towns.
  reasons.push("no address agreement; name similarity alone is not sufficient");
  const score = clamp(0.3 * nameSimilarity);
  return { score, decision: decide(score), signals, reasons };
}

/**
 * Two rows at one civic address in different suites, with no phone to separate
 * them.
 *
 * This is the medical-office-building shape, and it has no clean answer from
 * address alone. A shared organisation name across two suites is often one
 * practice spread over a floor ("Suites 250, 300"); two unrelated names is two
 * tenants. Neither reading is safe to act on automatically, so a strong name
 * match goes to a human and a weak one is treated as distinct — the direction
 * that cannot silently erase a practice from the roster.
 */
function suiteVerdict(
  unitA: string | null,
  unitB: string | null,
  nameSimilarity: number,
  signals: MatchSignals,
  reasons: string[],
): MatchResult {
  reasons.push(`different suites (${unitA} vs ${unitB}) and no phone number on either side`);
  if (nameSimilarity >= SAME_ORG_NAME_SIMILARITY) {
    reasons.push("same organisation — may be one practice across two suites, or two of its clinics");
    return { score: 0.78, decision: "review", signals, reasons };
  }
  reasons.push("different organisations — treated as two tenants of one building");
  return { score: 0.2, decision: "distinct", signals, reasons };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Best similarity across each side's display name and its aliases. */
function bestNameSimilarity(rawA: string, rawB: string): number {
  const a = parseName(rawA);
  const b = parseName(rawB);
  const variantsA = [a.base, ...a.aliases].filter(Boolean);
  const variantsB = [b.base, ...b.aliases].filter(Boolean);
  let best = 0;
  for (const va of variantsA) {
    for (const vb of variantsB) {
      best = Math.max(best, tokenSimilarity(nameTokens(va), nameTokens(vb)));
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

export type MatchLink = {
  a: string;
  b: string;
  score: number;
  decision: MatchDecision;
  reasons: string[];
};

export type Cluster<T extends MatchCandidate> = {
  /** Stable within a run; derived from the lexically smallest member key. */
  id: string;
  members: T[];
  /** Lowest merge score used to form this cluster. 1 for singletons. */
  confidence: number;
  /** True when at least one unresolved `review` link touches this cluster. */
  needsReview: boolean;
  reviewReasons: string[];
  mergeLinks: MatchLink[];
  reviewLinks: MatchLink[];
};

/**
 * Blocking keys. Comparing every pair is O(n²); these keys cut it to the pairs
 * that could plausibly match, without dropping true matches. A pair is compared
 * if it shares *any* key, so a wrong postal code in one source does not hide a
 * match that the geocode or the street would have found.
 */
function blockingKeys(c: MatchCandidate): string[] {
  const keys: string[] = [];
  const postal = normalizePostal(c.postal);
  const addr = parseAddress(c.addressLine1, c.addressLine2);
  const phone = normalizePhone(c.phone);

  if (postal) keys.push(`postal:${postal}`);
  if (phone) keys.push(`phone:${phone}`);
  if (addr.streetNumber && addr.streetName) {
    const firstWord = addr.streetName.split(" ")[0] ?? "";
    keys.push(`addr:${addr.streetNumber}:${firstWord}`);
  }
  if (c.lat !== null && c.lng !== null) {
    // ~110 m cells, plus neighbours so a match never falls across a boundary.
    const la = Math.round(c.lat * 1000);
    const ln = Math.round(c.lng * 1000);
    for (let dla = -1; dla <= 1; dla++) {
      for (let dln = -1; dln <= 1; dln++) keys.push(`geo:${la + dla}:${ln + dln}`);
    }
  }
  return keys;
}

class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    const p = this.parent.get(x);
    if (p === undefined) {
      this.parent.set(x, x);
      return x;
    }
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export type ResolveResult<T extends MatchCandidate> = {
  clusters: Array<Cluster<T>>;
  /** Every pair that scored in the review band and was deliberately not merged. */
  reviewLinks: MatchLink[];
  /** Pairs actually compared, for cost visibility. */
  comparisons: number;
};

/**
 * Resolve a candidate list into practice clusters.
 *
 * Pure: same input, same output, every time. Merges happen only at or above
 * `MERGE_THRESHOLD`; `review`-band pairs are recorded and surfaced but never
 * merged, so a wrong guess is always visible rather than silent.
 */
export function resolveEntities<T extends MatchCandidate>(
  candidates: readonly T[],
): ResolveResult<T> {
  const byKey = new Map<string, T>();
  for (const c of candidates) byKey.set(c.key, c);

  const buckets = new Map<string, string[]>();
  for (const c of candidates) {
    for (const k of blockingKeys(c)) {
      const list = buckets.get(k);
      if (list) list.push(c.key);
      else buckets.set(k, [c.key]);
    }
  }

  const seen = new Set<string>();
  const mergeLinks: MatchLink[] = [];
  const reviewLinks: MatchLink[] = [];
  const uf = new UnionFind();
  for (const c of candidates) uf.find(c.key);

  let comparisons = 0;
  for (const list of buckets.values()) {
    // A pathologically large block would make this quadratic again; in practice
    // the largest Ontario block is a handful of rows in one medical building.
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const ka = list[i];
        const kb = list[j];
        if (!ka || !kb || ka === kb) continue;
        const pairKey = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        const ca = byKey.get(ka);
        const cb = byKey.get(kb);
        if (!ca || !cb) continue;

        comparisons++;
        const r = scorePair(ca, cb);
        const link: MatchLink = {
          a: ka, b: kb, score: r.score, decision: r.decision, reasons: r.reasons,
        };
        if (r.decision === "merge") {
          mergeLinks.push(link);
          uf.union(ka, kb);
        } else if (r.decision === "review") {
          reviewLinks.push(link);
        }
      }
    }
  }

  const grouped = new Map<string, T[]>();
  for (const c of candidates) {
    const root = uf.find(c.key);
    const g = grouped.get(root);
    if (g) g.push(c);
    else grouped.set(root, [c]);
  }

  const clusters: Array<Cluster<T>> = [];
  for (const [root, members] of grouped) {
    const memberKeys = new Set(members.map((m) => m.key));
    const mine = mergeLinks.filter((l) => memberKeys.has(l.a) && memberKeys.has(l.b));
    // A review link touching this cluster means a human has to look, whether the
    // other end ended up in this cluster or a different one.
    const touchingReview = reviewLinks.filter((l) => memberKeys.has(l.a) || memberKeys.has(l.b));
    clusters.push({
      id: [...memberKeys].sort()[0] ?? root,
      members: [...members].sort((x, y) => x.key.localeCompare(y.key)),
      confidence: mine.length ? Math.min(...mine.map((l) => l.score)) : 1,
      needsReview: touchingReview.length > 0,
      reviewReasons: [...new Set(touchingReview.flatMap((l) => l.reasons))],
      mergeLinks: mine,
      reviewLinks: touchingReview,
    });
  }

  clusters.sort((a, b) => a.id.localeCompare(b.id));
  return { clusters, reviewLinks, comparisons };
}
