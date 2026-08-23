/**
 * Layer 3 + 4 — extract a status from each snapshot, reconcile across sources,
 * write an observation, and update the denormalised read cache.
 * Usage: pnpm extract -- --catchment toronto-east
 */
import { extractCatchment } from "../pipeline";
import { arg } from "./args";

async function main(): Promise<void> {
  const catchment = arg("catchment");

  console.log(`Extracting statuses for practices in "${catchment}"`);

  const stats = await extractCatchment({
    catchment,
    onProgress: (name, status, disputed) =>
      console.log(`  ${name}: ${status}${disputed ? " (disputed — queue for phone audit)" : ""}`),
  });

  console.log(
    `\nDone. ${stats.observationsSaved} observations saved, ` +
      `${stats.disputed} disputed` +
      (stats.confabulationsBlocked > 0 ? `, ${stats.confabulationsBlocked} confabulations blocked` : ""),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
