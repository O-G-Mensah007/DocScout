import type { PracticeType } from "@docscout/core";

/** Trust order from CLAUDE.md / the week-1 brief. Lower wins on conflict. */
export const SOURCE_RANK = {
  moh_lio: 1,
  statcan_odhf: 2,
  cpso: 3,
  afhto: 4,
} as const;

export type RosterSource = keyof typeof SOURCE_RANK;

/**
 * One location as a single source reports it, before entity resolution.
 * Deliberately close to the raw feed: normalisation happens in the matcher, so
 * that what a source actually said stays inspectable in the review queue.
 */
export type RosterCandidate = {
  key: string;
  source: RosterSource;
  sourceId: string;
  sourceUrl: string;
  retrievedAt: string;

  name: string;
  altNames: string[];
  type: PracticeType;

  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postal: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  websiteUrl: string | null;

  /** Organisation identifier where the source has one (MOH_SERVICE_PROVIDER_IDENT). */
  orgIdent: string | null;
  /** "Site" or "Satellite" in the MOH feed. */
  siteRole: string | null;
};
