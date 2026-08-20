/**
 * The three v1 catchments (docs/00-product-spec.md).
 *
 * Chosen to contrast, not to maximise coverage: a dense urban catchment, a
 * mid-size city, and a northern one where unattachment is worst.
 *
 * A catchment is a bounding box plus a postal allowlist, and a row must satisfy
 * both. The box alone is crude at the edges; the FSA list alone leaks badly,
 * because rural forward sortation areas are enormous — N0B spans Wellesley,
 * Elmira, *and* Erin, and P0L runs from Hearst to Moose Factory. Requiring both
 * keeps Guelph out of Waterloo and Kincardine out of everything, which a single
 * rule does not.
 */

export type Catchment = {
  slug: string;
  label: string;
  /** Short prefix used in generated practice ids: on-tor-…, on-wat-…, on-tim-… */
  idPrefix: string;
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  /** Forward sortation areas in scope. Empty means "box only". */
  fsaPrefixes: readonly string[];
  note: string;
};

const TORONTO_EAST_FSA = [
  // East York, Danforth, Riverdale, the Beaches, Leaside
  "M4B", "M4C", "M4E", "M4G", "M4H", "M4J", "M4K", "M4L", "M4M", "M4N",
  // Downtown east of Yonge: St Lawrence, Cabbagetown, Rosedale, Church-Wellesley
  "M5A", "M4W", "M4X", "M4Y",
  // Don Mills / Flemingdon
  "M3A", "M3B", "M3C",
  // Scarborough
  "M1B", "M1C", "M1E", "M1G", "M1H", "M1J", "M1K", "M1L", "M1M", "M1N",
  "M1P", "M1R", "M1S", "M1T", "M1V", "M1W", "M1X",
] as const;

const WATERLOO_FSA = [
  // Kitchener / Waterloo
  "N2A", "N2B", "N2C", "N2E", "N2G", "N2H", "N2J", "N2K", "N2L", "N2M",
  "N2N", "N2P", "N2R", "N2T", "N2V",
  // Cambridge
  "N1P", "N1R", "N1S", "N1T", "N3C", "N3E", "N3H",
  // Township communities: Elmira, St Jacobs, Wellesley, Baden, Ayr, Breslau
  "N0B", "N3A",
] as const;

const TIMMINS_FSA = [
  // Timmins and Porcupine
  "P4N", "P4P", "P4R", "P0N",
  // Cochrane District: Iroquois Falls, Matheson, Cochrane, Hearst, Moosonee
  "P0K", "P0L", "P5N",
] as const;

export const CATCHMENTS: readonly Catchment[] = [
  {
    slug: "toronto-east",
    label: "Toronto East (East York, Riverdale, Beaches, Scarborough)",
    idPrefix: "tor",
    bbox: { minLat: 43.63, maxLat: 43.815, minLng: -79.4, maxLng: -79.1 },
    fsaPrefixes: TORONTO_EAST_FSA,
    note: "Dense urban. East of Yonge Street to the Scarborough boundary.",
  },
  {
    slug: "waterloo",
    label: "Waterloo Region (Kitchener, Waterloo, Cambridge, townships)",
    idPrefix: "wat",
    bbox: { minLat: 43.28, maxLat: 43.62, minLng: -80.7, maxLng: -80.28 },
    fsaPrefixes: WATERLOO_FSA,
    note: "Mid-size city, mixed FHT/FHO. The eastern bound excludes Guelph.",
  },
  {
    slug: "timmins",
    label: "Timmins and Cochrane District",
    idPrefix: "tim",
    bbox: { minLat: 47.9, maxLat: 51.6, minLng: -84.2, maxLng: -79.8 },
    fsaPrefixes: TIMMINS_FSA,
    note: "Northern. Sparse, long distances, where unattachment is worst.",
  },
] as const;

export function getCatchment(slug: string): Catchment {
  const c = CATCHMENTS.find((x) => x.slug === slug);
  if (!c) {
    throw new Error(
      `Unknown catchment "${slug}". Known: ${CATCHMENTS.map((x) => x.slug).join(", ")}`,
    );
  }
  return c;
}

/** True when a point and postal code both fall inside the catchment. */
export function inCatchment(
  c: Catchment,
  point: { lat: number | null; lng: number | null; postal: string | null },
): boolean {
  const { lat, lng } = point;
  if (lat === null || lng === null) return false;
  const { bbox } = c;
  const inBox =
    lat >= bbox.minLat && lat <= bbox.maxLat && lng >= bbox.minLng && lng <= bbox.maxLng;
  if (!inBox) return false;
  if (c.fsaPrefixes.length === 0) return true;
  const fsa = (point.postal ?? "").toUpperCase().replace(/\s/g, "").slice(0, 3);
  return c.fsaPrefixes.includes(fsa);
}
