/**
 * Matcher tests.
 *
 * Every fixture below is a verbatim row from a live fetch on 2026-08-20 —
 * the Ontario MOH service-provider layer (LIO ESRI REST) and StatCan ODHF
 * v1.1. Nothing here is invented, because invented near-duplicates are always
 * easier than real ones and prove nothing.
 *
 * Refresh them with:
 *   pnpm roster:load -- --catchment <slug> --dry-run --write-seed
 */
import { describe, expect, it } from "vitest";
import { MERGE_THRESHOLD, resolveEntities, scorePair } from "./match";
import type { MatchCandidate } from "./match";

function row(p: Partial<MatchCandidate> & { key: string; source: string }): MatchCandidate {
  return {
    name: "",
    addressLine1: null,
    addressLine2: null,
    city: null,
    postal: null,
    phone: null,
    lat: null,
    lng: null,
    ...p,
  };
}

// ---------------------------------------------------------------------------
// Real near-duplicates that MUST merge.
// ---------------------------------------------------------------------------

/**
 * Case 1 — the brief's own example, found in the wild in Riverdale (M4K).
 * The two feeds spell the organisation differently and format the postal code
 * differently; it is one front desk at 430 Broadview Avenue.
 */
const BRIDGEPOINT_MOH = row({
  key: "moh_lio:321787331",
  source: "moh_lio",
  name: "Bridgepoint Family Health Team",
  addressLine1: "430 Broadview Avenue",
  city: "Toronto",
  postal: "M4K2N1",
  lat: 43.66755549905774,
  lng: -79.35275079999997,
});
const BRIDGEPOINT_ODHF = row({
  key: "statcan_odhf:2718",
  source: "statcan_odhf",
  name: "Bridgepoint Fht",
  addressLine1: "430 broadview avenue",
  city: "toronto",
  postal: "M4K 2N1",
  lat: 43.66755549,
  lng: -79.35275079,
});

/**
 * Case 2 — a unit letter on the civic number in one feed and not the other,
 * plus a directional abbreviation. 10B Victoria Street South, Kitchener.
 */
const CFFM_MOH = row({
  key: "moh_lio:321787489",
  source: "moh_lio",
  name: "Centre For Family Medicine Family Health Team",
  addressLine1: "10B Victoria Street South",
  city: "Kitchener",
  postal: "N2G1C5",
  lat: 43.45054489905726,
  lng: -80.49179809999998,
});
const CFFM_ODHF = row({
  key: "statcan_odhf:3902",
  source: "statcan_odhf",
  name: "Centre for Family Medicine Fht",
  addressLine1: "10 victoria street s",
  city: "kitchener",
  postal: "N2G 1C5",
  lat: 43.4510835,
  lng: -80.4914207,
});

/**
 * Case 3 — the same address written two ways, where ODHF's own geocode is
 * 2.4 km from the address it is attached to. The written address has to win,
 * or one practice becomes two.
 */
const SCHC_MOH = row({
  key: "moh_lio:321787359",
  source: "moh_lio",
  name: "Scarborough Centre For Healthy Communities (Food Bank)",
  addressLine1: "629 Markham Road",
  addressLine2: "Unit 2",
  city: "Toronto",
  postal: "M1H2A4",
  lat: 43.760860999057606,
  lng: -79.22410529999996,
});
const SCHC_ODHF = row({
  key: "statcan_odhf:5133",
  source: "statcan_odhf",
  name: "Scarborough Centre for Healthy Communities",
  addressLine1: "629 markham rd unit 2",
  city: "toronto",
  postal: "M1H 2A4",
  lat: 43.73904541,
  lng: -79.21573104,
});

/** Case 4 — a French/English pairing of one organisation at 123 Third Avenue. */
const TIMMINS_ACADEMIC_MOH = row({
  key: "moh_lio:321787297",
  source: "moh_lio",
  name: "Timmins Academic Family Health Team",
  addressLine1: "123 Third Avenue",
  addressLine2: "Suites 250, 300",
  city: "Timmins",
  postal: "P4N1C6",
  lat: 48.47475809906392,
  lng: -81.33186329999995,
});
const TIMMINS_ACADEMIC_ODHF = row({
  key: "statcan_odhf:5591",
  source: "statcan_odhf",
  name: "TIMMINS FAMILY HEALTH TEAM/EQUIPE DE SANTÉ FAMILIALE DE TIMMINS",
  addressLine1: "123 third avenue",
  city: "timmins",
  postal: "P4N 1C6",
  lat: 48.47475809,
  lng: -81.33186329,
});

describe("real near-duplicates across sources", () => {
  it("merges 'Bridgepoint Family Health Team' with 'Bridgepoint Fht'", () => {
    const r = scorePair(BRIDGEPOINT_MOH, BRIDGEPOINT_ODHF);
    expect(r.decision).toBe("merge");
    expect(r.score).toBeGreaterThanOrEqual(MERGE_THRESHOLD);
  });

  it("merges across a civic unit letter — 10B Victoria vs 10 victoria s", () => {
    const r = scorePair(CFFM_MOH, CFFM_ODHF);
    expect(r.decision).toBe("merge");
  });

  it("trusts the written address over a 2.4 km geocode error", () => {
    const r = scorePair(SCHC_MOH, SCHC_ODHF);
    expect(r.decision).toBe("merge");
    expect(r.reasons.join(" ")).toMatch(/geocoding error/);
  });

  it("merges the French and English names of one Timmins practice", () => {
    expect(scorePair(TIMMINS_ACADEMIC_MOH, TIMMINS_ACADEMIC_ODHF).decision).toBe("merge");
  });

  it("is symmetric", () => {
    const ab = scorePair(BRIDGEPOINT_MOH, BRIDGEPOINT_ODHF);
    const ba = scorePair(BRIDGEPOINT_ODHF, BRIDGEPOINT_MOH);
    expect(ab.score).toBe(ba.score);
    expect(ab.decision).toBe(ba.decision);
  });
});

// ---------------------------------------------------------------------------
// Real sibling sites that MUST NOT merge. This is the failure mode that
// silently deletes practices from the roster.
// ---------------------------------------------------------------------------

/**
 * The brief's "Riverdale FHT — Danforth Site" pattern, as it actually occurs:
 * one organisation, three addresses, all published simultaneously by the
 * province. Three separate front desks, three separate panels.
 */
const SETFHT_MAIN = row({
  key: "moh_lio:321787704",
  source: "moh_lio",
  name: "South East Toronto Family Health Team",
  addressLine1: "1871 Danforth Avenue",
  addressLine2: "4th Floor",
  city: "Toronto",
  postal: "M4C1J3",
  lat: 43.68446839905771,
  lng: -79.31728469999996,
});
const SETFHT_COXWELL = row({
  key: "moh_lio:321787705",
  source: "moh_lio",
  name: "South East Toronto Family Health Team- Coxwell Site",
  addressLine1: "840 Coxwell Avenue",
  addressLine2: "Unit 105",
  city: "Toronto",
  postal: "M4C5T2",
  lat: 43.6901428990577,
  lng: -79.32665849999995,
});

const TIMMINS_TOKE = row({
  key: "moh_lio:321787303",
  source: "moh_lio",
  name: "Timmins Academic Family Health Team-Toke Street Site",
  addressLine1: "247 Toke Street",
  city: "Timmins",
  postal: "P4N6V4",
  lat: 48.481312899063944,
  lng: -81.3223228,
});
const TIMMINS_MALL = row({
  key: "moh_lio:321787298",
  source: "moh_lio",
  name: "Timmins Academic Family Health Team-101 Mall Site",
  addressLine1: "38 Pine Street North",
  addressLine2: "Suite 208",
  city: "Timmins",
  postal: "P4N6K6",
  lat: 48.476764999063896,
  lng: -81.3279556,
});

/** Two programmes of one organisation, ten civic numbers apart on one street. */
const SCHC_EARLYON = row({
  key: "moh_lio:321787357",
  source: "moh_lio",
  name: "Scarborough Centre For Healthy Communities (Earlyon Child And Family Centre)",
  addressLine1: "4110 Lawrence Avenue East",
  city: "Toronto",
  postal: "M1E2S1",
  lat: 43.76706569905762,
  lng: -79.19415679999997,
});
const SCHC_FOODBANK = row({
  key: "moh_lio:321787358",
  source: "moh_lio",
  name: "Scarborough Centre For Healthy Communities (Food Bank)",
  addressLine1: "4100 Lawrence Avenue East",
  city: "Scarborough",
  postal: "M1E2S2",
  lat: 43.76697309905761,
  lng: -79.19538589999996,
});

describe("real sibling sites of one organisation", () => {
  it("keeps the main site and the Coxwell site apart", () => {
    const r = scorePair(SETFHT_MAIN, SETFHT_COXWELL);
    expect(r.decision).toBe("distinct");
  });

  it("keeps two Timmins Academic FHT sites apart despite near-identical names", () => {
    const r = scorePair(TIMMINS_TOKE, TIMMINS_MALL);
    expect(r.decision).toBe("distinct");
    expect(r.signals.nameSimilarity).toBeGreaterThan(0.7);
  });

  it("keeps 4100 and 4110 Lawrence Avenue East apart", () => {
    expect(scorePair(SCHC_EARLYON, SCHC_FOODBANK).decision).toBe("distinct");
  });

  it("never merges two rows the province publishes at once", () => {
    // The province listing both simultaneously is a positive statement that
    // they are two places — the relocation reading is not available.
    const r = scorePair(TIMMINS_TOKE, TIMMINS_MALL);
    expect(r.reasons.join(" ")).toMatch(/one feed listing two locations/);
  });
});

// ---------------------------------------------------------------------------
// Real cases the matcher must refuse to decide.
// ---------------------------------------------------------------------------

/**
 * Same civic number, same postal code, different street. One of the two feeds
 * is wrong and there is nothing available to say which.
 */
const BANCROFT_MOH = row({
  key: "moh_lio:321787456",
  source: "moh_lio",
  name: "Bancroft Community Family Health Team",
  addressLine1: "16 Station Street",
  city: "Bancroft",
  postal: "K0L1C0",
  lat: 45.059719799056815,
  lng: -77.85664059999999,
});
const BANCROFT_ODHF = row({
  key: "statcan_odhf:2592",
  source: "statcan_odhf",
  name: "Bancroft Fht",
  addressLine1: "16 billa street",
  city: "bancroft",
  postal: "K0L 1C0",
  lat: 45.0555315,
  lng: -77.84916191,
});

/** The 2019-20 address for a practice the province now lists 75 m away. */
const SETFHT_ODHF_STALE = row({
  key: "statcan_odhf:5324",
  source: "statcan_odhf",
  name: "South East Toronto Fht",
  addressLine1: "833 coxwell avenue",
  city: "toronto",
  postal: "M4C 3E8",
  lat: 43.69079619,
  lng: -79.32641447,
});

describe("cases the matcher refuses to decide", () => {
  it("sends 16 Station Street vs 16 billa street to review, not to a merge", () => {
    const r = scorePair(BANCROFT_MOH, BANCROFT_ODHF);
    expect(r.decision).toBe("review");
    expect(r.score).toBeLessThan(MERGE_THRESHOLD);
    expect(r.reasons.join(" ")).toMatch(/different street names/);
  });

  it("sends a probable relocation to review rather than guessing", () => {
    const r = scorePair(SETFHT_COXWELL, SETFHT_ODHF_STALE);
    expect(r.decision).toBe("review");
    expect(r.reasons.join(" ")).toMatch(/possible relocation/);
  });

  it("does not merge on name alone", () => {
    const a = row({
      key: "moh_lio:a", source: "moh_lio",
      name: "Community Health Centre", addressLine1: "1 Main Street",
      city: "Ottawa", postal: "K1A0A1", lat: 45.4, lng: -75.7,
    });
    const b = row({
      key: "moh_lio:b", source: "moh_lio",
      name: "Community Health Centre", addressLine1: "1 Main Street",
      city: "Windsor", postal: "N9A0A1", lat: 42.3, lng: -83.0,
    });
    expect(scorePair(a, b).decision).toBe("distinct");
  });
});

// ---------------------------------------------------------------------------
// Clustering.
// ---------------------------------------------------------------------------

describe("resolveEntities", () => {
  const all = [
    BRIDGEPOINT_MOH, BRIDGEPOINT_ODHF,
    SETFHT_MAIN, SETFHT_COXWELL, SETFHT_ODHF_STALE,
    TIMMINS_TOKE, TIMMINS_MALL,
    BANCROFT_MOH, BANCROFT_ODHF,
  ];

  it("merges only what passes the threshold", () => {
    const { clusters } = resolveEntities(all);
    const bridgepoint = clusters.find((c) => c.members.some((m) => m.key === BRIDGEPOINT_MOH.key));
    expect(bridgepoint?.members).toHaveLength(2);
  });

  it("leaves review-band pairs unmerged and flags the cluster", () => {
    const { clusters, reviewLinks } = resolveEntities(all);
    const bancroft = clusters.find((c) => c.members.some((m) => m.key === BANCROFT_MOH.key));
    expect(bancroft?.members).toHaveLength(1);
    expect(bancroft?.needsReview).toBe(true);
    expect(reviewLinks.some((l) => l.a === BANCROFT_MOH.key || l.b === BANCROFT_MOH.key)).toBe(true);
  });

  it("keeps the three South East Toronto rows as separate practices", () => {
    const { clusters } = resolveEntities(all);
    const keys = [SETFHT_MAIN.key, SETFHT_COXWELL.key, SETFHT_ODHF_STALE.key];
    const ids = new Set(
      keys.map((k) => clusters.find((c) => c.members.some((m) => m.key === k))?.id),
    );
    expect(ids.size).toBe(3);
  });

  it("is deterministic and order-independent", () => {
    const a = resolveEntities(all);
    const b = resolveEntities([...all].reverse());
    const shape = (r: typeof a) =>
      r.clusters.map((c) => c.members.map((m) => m.key).sort().join("+")).sort();
    expect(shape(a)).toEqual(shape(b));
  });

  it("compares far fewer pairs than the quadratic worst case", () => {
    const { comparisons } = resolveEntities(all);
    expect(comparisons).toBeLessThan((all.length * (all.length - 1)) / 2);
  });

  it("gives a singleton full confidence, because nothing was merged", () => {
    const { clusters } = resolveEntities([BRIDGEPOINT_MOH]);
    expect(clusters[0]?.confidence).toBe(1);
    expect(clusters[0]?.needsReview).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The medical office building.
//
// Synthetic, and labelled as such: no open source we have carries a telephone
// number, so this shape cannot yet be drawn from fetched data. It is modelled
// on 1929 Bayview Avenue — one civic number, one postal code, one set of
// coordinates, many unrelated tenants distinguished only by a suite that
// sources drop about half the time.
//
// This is what physician-level data looks like. When the CPSO extract lands it
// will be the dominant shape in the roster, not an edge case: several thousand
// solo and group practices whose addresses are identical to their neighbours'.
// Address alone cannot separate them, which is why phone is consulted first.
// ---------------------------------------------------------------------------

const MOB = { line: "1929 Bayview Avenue", city: "Toronto", postal: "M4G3E8", lat: 43.7135, lng: -79.3721 };
const tenant = (
  key: string, source: string, name: string, unit: string | null, phone: string | null,
): MatchCandidate =>
  row({
    key, source, name,
    addressLine1: MOB.line, addressLine2: unit,
    city: MOB.city, postal: MOB.postal, phone, lat: MOB.lat, lng: MOB.lng,
  });

describe("medical office building — one address, many practices", () => {
  it("merges two listings that share a phone, even across different suites", () => {
    // The province records the building's suite; the physician register records
    // the floor. Same line, so it is one front desk.
    const a = tenant("moh_lio:mob1", "moh_lio", "Bayview Family Practice", "Suite 210", "416-555-0142");
    const b = tenant("cpso:mob1", "cpso", "Dr. A. Nakamura", "Suite 2A", "(416) 555-0142");
    const r = scorePair(a, b);
    expect(r.decision).toBe("merge");
    expect(r.reasons.join(" ")).toMatch(/same phone number/);
  });

  it("keeps two tenants apart when suite and phone both differ", () => {
    const a = tenant("cpso:mob2", "cpso", "Dr. A. Nakamura", "Suite 210", "416-555-0142");
    const b = tenant("cpso:mob3", "cpso", "Dr. P. Okonkwo", "Suite 305", "416-555-0199");
    const r = scorePair(a, b);
    expect(r.decision).toBe("distinct");
    expect(r.reasons.join(" ")).toMatch(/two practices in one building/);
  });

  it("does not merge two tenants just because the whole address matches", () => {
    // The failure this whole section exists to prevent: identical civic number,
    // postal code and coordinates, and no suite recorded on either side.
    const a = tenant("cpso:mob4", "cpso", "Dr. A. Nakamura", null, "416-555-0142");
    const b = tenant("cpso:mob5", "cpso", "Dr. P. Okonkwo", null, "416-555-0199");
    const r = scorePair(a, b);
    expect(r.decision).not.toBe("merge");
    expect(r.signals.phoneEqual).toBe(false);
  });

  it("sends one address with two phone numbers and no suite to a human", () => {
    // A main line and a department line for one practice look exactly like two
    // practices. Nothing available decides it, so nobody pretends otherwise.
    const a = tenant("moh_lio:mob6", "moh_lio", "Bayview Family Practice", null, "416-555-0142");
    const b = tenant("cpso:mob7", "cpso", "Bayview Family Practice", null, "416-555-0143");
    const r = scorePair(a, b);
    expect(r.decision).toBe("review");
    expect(r.reasons.join(" ")).toMatch(/no suite to tell them apart/);
  });

  it("reviews same-organisation suites when no phone is available at all", () => {
    // Today's data: neither open source has a phone. "Suites 250, 300" is one
    // practice across a floor; two suites of one org may not be.
    const a = tenant("moh_lio:mob8", "moh_lio", "Bayview Family Practice", "Suite 250", null);
    const b = tenant("moh_lio:mob9", "moh_lio", "Bayview Family Practice", "Suite 300", null);
    const r = scorePair(a, b);
    expect(r.decision).toBe("review");
    expect(r.reasons.join(" ")).toMatch(/no phone number on either side/);
  });

  it("treats unrelated names in different suites as distinct without a phone", () => {
    const a = tenant("moh_lio:mob10", "moh_lio", "Bayview Family Practice", "Suite 250", null);
    const b = tenant("moh_lio:mob11", "moh_lio", "East York Dermatology Associates", "Suite 300", null);
    expect(scorePair(a, b).decision).toBe("distinct");
  });

  it("a shared phone outranks a name that looks nothing alike", () => {
    // Practices rebrand and physicians are listed under their own names; the
    // line they answer is the more reliable identity.
    const a = tenant("moh_lio:mob12", "moh_lio", "Bayview Family Practice", "Suite 210", "416-555-0142");
    const b = tenant("cpso:mob13", "cpso", "Dr. A. Nakamura", "Suite 210", "416-555-0142");
    const r = scorePair(a, b);
    expect(r.decision).toBe("merge");
    expect(r.signals.nameSimilarity).toBeLessThan(0.3);
  });

  it("does not let a shared phone merge across genuinely different places", () => {
    // A billing or answering service can front several clinics. Location still
    // has a veto.
    const a = tenant("cpso:mob14", "cpso", "Dr. A. Nakamura", "Suite 210", "416-555-0142");
    const b = row({
      key: "cpso:far", source: "cpso", name: "Dr. A. Nakamura",
      addressLine1: "500 Queen Street West", city: "Toronto", postal: "M5V2B3",
      phone: "416-555-0142", lat: 43.6478, lng: -79.4001,
    });
    expect(scorePair(a, b).decision).toBe("distinct");
  });

  it("resolves a whole floor into the right number of practices", () => {
    const floor = [
      tenant("cpso:f1", "cpso", "Dr. A. Nakamura", "Suite 210", "416-555-0142"),
      tenant("moh_lio:f2", "moh_lio", "Bayview Family Practice", "Suite 210", "416-555-0142"),
      tenant("cpso:f3", "cpso", "Dr. P. Okonkwo", "Suite 305", "416-555-0199"),
      tenant("cpso:f4", "cpso", "Dr. R. Villanueva", "Suite 410", "416-555-0177"),
      tenant("cpso:f5", "cpso", "Dr. S. Haddad", "Suite 410", "416-555-0177"),
    ];
    const { clusters } = resolveEntities(floor);
    // Nakamura + the practice listing are one front desk; Villanueva and Haddad
    // share Suite 410 and a line, so they are one practice with two physicians.
    expect(clusters).toHaveLength(3);
    expect(clusters.every((c) => !c.needsReview)).toBe(true);
  });
});
