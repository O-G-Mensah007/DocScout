/**
 * Layer 1 — the roster. Who exists.
 *
 * Seeds from Ontario open data and a hand-curated catchment file. Expect this
 * to be messier than it sounds: one clinic appears under four names across
 * three sources. Dedupe is the unglamorous work that determines whether
 * everything above it is coherent. Budget real time for it.
 *
 * Usage: pnpm roster:load -- --catchment toronto-east [--file ./data/x.json]
 *
 * TODO(week-1): wire the ESRI REST endpoints for Family Health Team and
 * Community Health Centre locations, plus the CPSO register for practice
 * addresses. Until then this reads a local JSON seed so the pipeline is
 * runnable end to end on day one.
 */
import { readFile } from "node:fs/promises";
import { db, practices } from "@docscout/db";
import { arg } from "./args";

type Seed = {
  id: string;
  name: string;
  type: string;
  addressLine1: string;
  city: string;
  postal: string;
  lat?: number;
  lng?: number;
  websiteUrl?: string;
  phone?: string;
};

async function main(): Promise<void> {
  const catchment = arg("catchment");
  const file = arg("file", `./data/seeds/${catchment}.json`);

  const seeds = JSON.parse(await readFile(file, "utf8")) as Seed[];
  console.log(`Loading ${seeds.length} practices into catchment "${catchment}"`);

  for (const s of seeds) {
    await db()
      .insert(practices)
      .values({
        id: s.id,
        name: s.name,
        type: s.type as never,
        addressLine1: s.addressLine1,
        city: s.city,
        postal: s.postal,
        lat: s.lat ?? null,
        lng: s.lng ?? null,
        catchment,
        websiteUrl: s.websiteUrl ?? null,
        phone: s.phone ?? null,
      })
      .onConflictDoNothing();
  }

  console.log("Done. Next: pnpm crawl -- --catchment " + catchment);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
