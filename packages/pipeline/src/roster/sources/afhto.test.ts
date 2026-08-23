import { describe, expect, it } from "vitest";
import { extractLocationsJson, parseAfhtoPage } from "./afhto";

const fakeHtml = (locations: object[]) => {
  const json = JSON.stringify(locations)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<html><body><div data-locations='${json}'></div></body></html>`;
};

const loc = (overrides: Record<string, unknown> = {}) => ({
  lat: 43.653,
  lng: -79.388,
  title: "Test Family Health Team",
  description:
    '<p><strong>Type:</strong> FHT</p>' +
    '<p><strong>Address:</strong> 100 Main Street, Suite 200</p>' +
    '<p><strong>Municipality:</strong> Toronto</p>' +
    '<p><strong>Phone Number:</strong> 416-555-0100</p>' +
    '<p><strong>Website:</strong> <a href="https://testfht.ca/" target="_blank" rel="noopener">https://testfht.ca/</a></p>',
  type: "FHT",
  icon: "https://www.afhto.ca/wp-content/plugins/afhto-find-a-team/assets/icons/FHT.svg",
  ...overrides,
});

describe("extractLocationsJson", () => {
  it("extracts JSON from data-locations attribute", () => {
    const html = fakeHtml([loc()]);
    const result = extractLocationsJson(html);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Test Family Health Team");
  });

  it("throws when data-locations is missing", () => {
    expect(() => extractLocationsJson("<html><body></body></html>")).toThrow(
      "could not find data-locations",
    );
  });
});

describe("parseAfhtoPage", () => {
  it("parses a complete entry with all fields", () => {
    const html = fakeHtml([loc()]);
    const result = parseAfhtoPage(html, "2026-08-22T00:00:00Z");

    expect(result).toHaveLength(1);
    const c = result[0]!;
    expect(c.source).toBe("afhto");
    expect(c.name).toBe("Test Family Health Team");
    expect(c.type).toBe("FHT");
    expect(c.addressLine1).toBe("100 Main Street, Suite 200");
    expect(c.city).toBe("Toronto");
    expect(c.phone).toBe("416-555-0100");
    expect(c.websiteUrl).toBe("https://testfht.ca/");
    expect(c.lat).toBe(43.653);
    expect(c.lng).toBe(-79.388);
    expect(c.postal).toBeNull();
    expect(c.sourceUrl).toBe("https://www.afhto.ca/find-a-team");
    expect(c.key).toMatch(/^afhto:/);
  });

  it("handles entry with no website", () => {
    const html = fakeHtml([
      loc({
        description:
          '<p><strong>Type:</strong> CHC</p>' +
          '<p><strong>Address:</strong> 120 Brock Street</p>' +
          '<p><strong>Municipality:</strong> Sault Ste. Marie</p>' +
          '<p><strong>Phone Number:</strong> 705-992-5153</p>',
        type: "CHC",
      }),
    ]);
    const result = parseAfhtoPage(html, "2026-08-22T00:00:00Z");
    expect(result[0]!.websiteUrl).toBeNull();
    expect(result[0]!.phone).toBe("705-992-5153");
    expect(result[0]!.type).toBe("CHC");
  });

  it("handles entry with no phone", () => {
    const html = fakeHtml([
      loc({
        description:
          '<p><strong>Address:</strong> 400 University Ave</p>' +
          '<p><strong>Municipality:</strong> Toronto</p>',
      }),
    ]);
    const result = parseAfhtoPage(html, "2026-08-22T00:00:00Z");
    expect(result[0]!.phone).toBeNull();
    expect(result[0]!.websiteUrl).toBeNull();
  });

  it("handles numeric municipality codes by returning null", () => {
    const html = fakeHtml([
      loc({
        description:
          '<p><strong>Address:</strong> 123 Oak Street</p>' +
          '<p><strong>Municipality:</strong> 174</p>' +
          '<p><strong>Phone Number:</strong> 416-555-0100</p>',
      }),
    ]);
    const result = parseAfhtoPage(html, "2026-08-22T00:00:00Z");
    expect(result[0]!.city).toBeNull();
  });

  it("maps IFHT type to FHT", () => {
    const html = fakeHtml([loc({ type: "IFHT" })]);
    const result = parseAfhtoPage(html, "2026-08-22T00:00:00Z");
    expect(result[0]!.type).toBe("FHT");
  });

  it("maps NPLC type correctly", () => {
    const html = fakeHtml([loc({ type: "NPLC" })]);
    const result = parseAfhtoPage(html, "2026-08-22T00:00:00Z");
    expect(result[0]!.type).toBe("NPLC");
  });

  it("maps AHAC type correctly", () => {
    const html = fakeHtml([loc({ type: "AHAC" })]);
    const result = parseAfhtoPage(html, "2026-08-22T00:00:00Z");
    expect(result[0]!.type).toBe("AHAC");
  });

  it("maps IIPCT and OTHER to 'other'", () => {
    const html = fakeHtml([loc({ type: "IIPCT" }), loc({ type: "OTHER" })]);
    const result = parseAfhtoPage(html, "2026-08-22T00:00:00Z");
    expect(result[0]!.type).toBe("other");
    expect(result[1]!.type).toBe("other");
  });

  it("parses multiple entries", () => {
    const html = fakeHtml([
      loc({ title: "Team Alpha" }),
      loc({ title: "Team Beta", type: "CHC" }),
      loc({ title: "Team Gamma", type: "NPLC" }),
    ]);
    const result = parseAfhtoPage(html, "2026-08-22T00:00:00Z");
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.name)).toEqual(["Team Alpha", "Team Beta", "Team Gamma"]);
  });

  it("generates deterministic keys from index and title", () => {
    const html = fakeHtml([loc({ title: "Centre for Family Medicine" })]);
    const result = parseAfhtoPage(html, "2026-08-22T00:00:00Z");
    expect(result[0]!.key).toBe("afhto:0:centre-for-family-medicine");
    expect(result[0]!.sourceId).toBe("0:centre-for-family-medicine");
  });

  it("handles bare website URL without anchor tag", () => {
    const html = fakeHtml([
      loc({
        description:
          '<p><strong>Address:</strong> 55 Elm St</p>' +
          '<p><strong>Municipality:</strong> Ottawa</p>' +
          '<p><strong>Phone Number:</strong> 613-555-0100</p>' +
          '<p><strong>Website:</strong> https://plainurl.ca/</p>',
      }),
    ]);
    const result = parseAfhtoPage(html, "2026-08-22T00:00:00Z");
    expect(result[0]!.websiteUrl).toBe("https://plainurl.ca/");
  });

  it("sets altNames to empty array", () => {
    const html = fakeHtml([loc()]);
    const result = parseAfhtoPage(html, "2026-08-22T00:00:00Z");
    expect(result[0]!.altNames).toEqual([]);
  });

  it("handles non-finite lat/lng gracefully", () => {
    const html = fakeHtml([loc({ lat: NaN, lng: Infinity })]);
    const result = parseAfhtoPage(html, "2026-08-22T00:00:00Z");
    expect(result[0]!.lat).toBeNull();
    expect(result[0]!.lng).toBeNull();
  });
});
