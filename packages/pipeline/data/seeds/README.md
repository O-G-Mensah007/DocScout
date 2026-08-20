# Roster seed snapshots

These are **caches, not source data.** The loader fetches live from the Ontario
MOH service-provider layer and StatCan ODHF on every run; these files are a
snapshot of what a fetch returned, so that the resolver can be run and the
matcher exercised without a network.

They are the normalised *candidates* — one entry per source row, before entity
resolution — not resolved practices.

Refresh:

```bash
pnpm roster:load -- --catchment toronto-east --dry-run --write-seed
```

Use:

```bash
pnpm roster:load -- --catchment toronto-east --from-seed --dry-run
```

Do not hand-edit them. If a record looks wrong, it is wrong at the source, and
that is worth knowing — fix it in the matcher or report it upstream, not here.

The `toronto-east.json` placeholder that used to live in this directory was a
single fabricated example practice. It is gone; nothing should be fabricated at
this layer.
