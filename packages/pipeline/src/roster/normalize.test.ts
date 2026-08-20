import { describe, expect, it } from "vitest";
import {
  civicBase,
  haversineKm,
  nameTokens,
  normalizeName,
  normalizePhone,
  normalizePostal,
  normalizeStreetName,
  parseAddress,
  parseName,
  postalFsa,
  streetSimilarity,
  tokenSimilarity,
} from "./normalize";

describe("normalizePostal", () => {
  it("canonicalises the spacings the two feeds actually use", () => {
    // MOH writes "M4K2N1"; ODHF writes "M4K 2N1".
    expect(normalizePostal("M4K2N1")).toBe("M4K2N1");
    expect(normalizePostal("M4K 2N1")).toBe("M4K2N1");
    expect(normalizePostal("m4k-2n1")).toBe("M4K2N1");
  });

  it("rejects anything that is not a Canadian postal code", () => {
    expect(normalizePostal("M4K 2N")).toBeNull();
    expect(normalizePostal("90210")).toBeNull();
    expect(normalizePostal("")).toBeNull();
    expect(normalizePostal(null)).toBeNull();
  });

  it("extracts the forward sortation area", () => {
    expect(postalFsa("P4N 1C6")).toBe("P4N");
    expect(postalFsa("nonsense")).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("reduces NANP variants to ten digits", () => {
    expect(normalizePhone("416-555-0100")).toBe("4165550100");
    expect(normalizePhone("(416) 555-0100")).toBe("4165550100");
    expect(normalizePhone("+1 416 555 0100")).toBe("4165550100");
  });

  it("drops the extension, because two listings of one front desk differ by it", () => {
    expect(normalizePhone("416-555-0100 ext. 240")).toBe("4165550100");
    expect(normalizePhone("416-555-0100 x240")).toBe("4165550100");
  });

  it("rejects impossible numbers rather than guessing", () => {
    expect(normalizePhone("555-0100")).toBeNull();
    expect(normalizePhone("116-555-0100")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("normalizeStreetName", () => {
  it("expands the abbreviations that differ between the two feeds", () => {
    // MOH: "721 Front Road South" · ODHF: "721 front road s"
    expect(normalizeStreetName("Front Road South")).toBe("front road south");
    expect(normalizeStreetName("front road s")).toBe("front road south");
    // MOH: "227 Algonquin Boulevard West" · abbreviated: "algonquin blvd w"
    expect(normalizeStreetName("Algonquin Boulevard West")).toBe("algonquin boulevard west");
    expect(normalizeStreetName("algonquin blvd w")).toBe("algonquin boulevard west");
  });

  it("reads a leading St as Saint and a later St as Street", () => {
    expect(normalizeStreetName("St Clair Avenue East")).toBe("saint clair avenue east");
    expect(normalizeStreetName("Toke St")).toBe("toke street");
  });

  it("keeps a direction word that is part of the name", () => {
    // "West" here is the street, not a suffix — it is not in final position.
    expect(normalizeStreetName("West Street North")).toBe("west street north");
  });
});

describe("parseAddress", () => {
  it("splits the civic number from the street", () => {
    const a = parseAddress("430 Broadview Avenue", null);
    expect(a.streetNumber).toBe("430");
    expect(a.streetName).toBe("broadview avenue");
  });

  it("keeps the unit letter but exposes the base separately", () => {
    // Real pair: MOH "10B Victoria Street South" vs ODHF "10 victoria street s".
    const moh = parseAddress("10B Victoria Street South", null);
    const odhf = parseAddress("10 victoria street s", null);
    expect(moh.streetNumber).toBe("10B");
    expect(moh.streetNumberBase).toBe("10");
    expect(odhf.streetNumberBase).toBe("10");
    expect(moh.streetName).toBe(odhf.streetName);
  });

  it("pulls the unit out of the street however the source packed it", () => {
    // MOH puts it in line 2, ODHF appends it to the street.
    const moh = parseAddress("629 Markham Road", "Unit 2");
    const odhf = parseAddress("629 markham rd unit 2", null);
    expect(moh.streetName).toBe("markham road");
    expect(odhf.streetName).toBe("markham road");
    expect(moh.unit).toBe("suite 2");
  });

  it("ignores a PO box, which is never the front desk", () => {
    // Real row: Nord-Aski FHT, "1403 Edward Street" / "Postal Office Box 2260".
    const a = parseAddress("1403 Edward Street", "Postal Office Box 2260");
    expect(a.unit).toBeNull();
    expect(a.streetName).toBe("edward street");
  });

  it("survives an address with no civic number", () => {
    // Real row: Timmins Academic FHT-Gogama Site, "Rue Low Street".
    const a = parseAddress("Rue Low Street", "15-A");
    expect(a.streetNumber).toBeNull();
    expect(a.streetName).toBe("rue low street");
  });
});

describe("civicBase", () => {
  it("strips a unit letter and leaves plain numbers alone", () => {
    expect(civicBase("58A")).toBe("58");
    expect(civicBase("58")).toBe("58");
    expect(civicBase("12-14")).toBe("12-14");
    expect(civicBase(null)).toBeNull();
  });
});

describe("normalizeName / parseName", () => {
  it("expands the domain abbreviations the feeds mix freely", () => {
    // Real pair: "Bridgepoint Family Health Team" vs "Bridgepoint Fht".
    expect(normalizeName("Bridgepoint Fht")).toBe("bridgepoint family health team");
    expect(normalizeName("Grandview Fht")).toBe("grandview family health team");
    expect(normalizeName("Anne Johnston Health Center")).toBe("anne johnston health centre");
  });

  it("folds accents so the French and English rows agree", () => {
    // Real row: "TIMMINS FAMILY HEALTH TEAM/EQUIPE DE SANTÉ FAMILIALE DE TIMMINS".
    expect(normalizeName("SANTÉ")).toBe("sante");
  });

  it("separates a site qualifier from the organisation", () => {
    // Real row: "South East Toronto Family Health Team- Coxwell Site".
    const p = parseName("South East Toronto Family Health Team- Coxwell Site");
    expect(p.base).toBe("south east toronto family health team");
    expect(p.siteQualifier).toBe("coxwell site");
  });

  it("keeps a former name as an alias so it can still match", () => {
    // Real row: "Vibrant Health Care Alliance (Formerly Anne Johnston Health Station)".
    const p = parseName("Vibrant Health Care Alliance (Formerly Anne Johnston Health Station)");
    expect(p.base).toBe("vibrant health care alliance");
    expect(p.aliases).toContain("anne johnston health station");
  });

  it("drops tokens that discriminate nothing", () => {
    expect(nameTokens("The Centre of Health in Ontario")).toEqual(["centre", "health"]);
  });
});

describe("similarity", () => {
  it("scores identical token sets as 1 and disjoint ones as 0", () => {
    expect(tokenSimilarity(["a", "b"], ["a", "b"])).toBe(1);
    expect(tokenSimilarity(["a"], ["b"])).toBe(0);
    expect(tokenSimilarity([], [])).toBe(1);
  });

  it("treats abbreviation variants of one street as the same", () => {
    expect(
      streetSimilarity(normalizeStreetName("Front Road South"), normalizeStreetName("front road s")),
    ).toBe(1);
  });
});

describe("haversineKm", () => {
  it("measures a short urban distance", () => {
    // The two real South East Toronto FHT listings on Coxwell Avenue.
    const d = haversineKm(
      { lat: 43.6901428990577, lng: -79.32665849999995 },
      { lat: 43.69079619, lng: -79.32641447 },
    );
    expect(d).toBeGreaterThan(0.05);
    expect(d).toBeLessThan(0.1);
  });

  it("is zero for a point against itself", () => {
    expect(haversineKm({ lat: 43.7, lng: -79.3 }, { lat: 43.7, lng: -79.3 })).toBe(0);
  });
});
