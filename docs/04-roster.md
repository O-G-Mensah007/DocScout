# The roster (Layer 1)

Who exists. The slowest-changing layer and the one whose errors are hardest to
see: a wrong roster does not fail loudly, it quietly corrupts every status,
freshness figure and audit sample above it.

Decisions and their reasoning live in
[ADR 0003](adr/0003-roster-sources-and-entity-resolution.md). This page is how
to run it and how to read what it prints.

## Running it

```bash
pnpm roster:load -- --catchment toronto-east
```

| Flag | Effect |
| --- | --- |
| `--catchment <slug>` | Required. `toronto-east`, `waterloo`, or `timmins` |
| `--dry-run` | Fetch, resolve and report, but write nothing. Needs no `DATABASE_URL` |
| `--review` | Print the unresolved pairs in full, with reasons |
| `--write-seed` | Cache the fetched candidates to `data/seeds/<catchment>.candidates.json` |
| `--from-seed` | Resolve from that cache instead of the network |
| `--no-cross-check` | Skip StatCan ODHF |

The run exits non-zero if the `needs_review` rate exceeds 10%.

## Sources

| # | Source | Role | Live? |
| --- | --- | --- | --- |
| 1 | Ontario MOH service provider locations (LIO, ESRI REST) | Creates practices | Yes, every run |
| 2 | StatCan ODHF v1.1 | Enriches only — never creates a practice | Yes, every run |
| 3 | CPSO Physician Register | **Not automated.** See below | No |

### The CPSO position, in short

We do not crawl the register. CPSO operates a formal data-sharing process whose
standardised dataset contains exactly what we need — practice addresses and
telephone numbers — and limits eligibility to continuity of care and health
resource planning, excluding research and commercial requests.

Getting that extract is a written request, not a code change. Once a human has
one, point `CPSO_REGISTER_EXTRACT_PATH` at the file and the loader will pick it
up. Until then the loader prints why it is skipping it, on every run.

Read the ADR before changing this. The reasoning is not about robots.txt.

## Catchments

A catchment is a bounding box **and** a postal allowlist; a row must satisfy
both. Either rule alone is wrong: boxes are crude at municipal edges, and rural
forward sortation areas are enormous — `N0B` spans Wellesley, Elmira *and*
Erin; `P0L` runs from Hearst to Moose Factory.

| Slug | Area | Practices |
| --- | --- | --- |
| `toronto-east` | East York, Riverdale, the Beaches, Scarborough | 32 |
| `waterloo` | Kitchener, Waterloo, Cambridge, townships | 16 |
| `timmins` | Timmins and Cochrane District | 17 |

Edit them in `packages/pipeline/src/roster/catchments.ts`.

## Reading the report

```
  candidates           43      rows from all sources, inside the catchment
  pairs compared        9      after blocking; the quadratic cost avoided
  clusters             38      distinct entities found
  multi-source          5      clusters built from more than one source
  practices            32      what would be written
  cross-check only      6      ODHF rows matching nothing — not loaded
  stale addresses       2      ODHF lists a loaded practice elsewhere — advisory

  needs_review          0      (0.0% of practices)
```

**`needs_review`** counts practices whose *composition* the matcher could not
safely decide — where being wrong would create a duplicate or merge away a real
practice. It does not count disagreements with the cross-check source, because
those cannot change the roster; those are the `stale addresses` line, and they
appear in `review_reasons` without setting the flag.

**`cross-check only`** is a coverage signal, not an error. It is usually an
organisation that has moved or closed since 2019–20.

Inspect anything unresolved with `--review`. Nothing in that bucket has been
merged; that is the point of it.

## Known gaps

These are real, and they constrain week 2. None is a bug.

1. **No telephone numbers, no websites.** Neither open source publishes them.
   Layer 2 crawls practice websites; with no URL it has nothing to crawl.
   Resolving this is the first task after the CPSO decision.
2. **No solo or group family practices.** FHO/FHG physicians are the majority
   of Ontario primary care and appear in no open dataset — only in the CPSO
   register. The roster today is funded team-based primary care only.
3. **65 practices, against a 300–600 target.** Consequence of (2). Ontario has
   585 such locations in total, so three catchments cannot reach 300 from this
   source. It is not a bounds or matcher problem.

## Changing the matcher

`packages/pipeline/src/roster/match.ts` is pure — no clock, no network, no
database — so every change is testable offline. Fixtures in `match.test.ts` are
verbatim rows from live fetches, including the sibling-site cases that a
name-weighted matcher merges and must not.

Write the failing fixture first. And if the review bucket grows, add a signal;
do not move the threshold.
