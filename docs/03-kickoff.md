# Kickoff prompts

Prompts for driving this repo with a coding agent. Paste at the repo root.

`CLAUDE.md` is loaded automatically — never paste its contents into a prompt.
Reference it instead. Repeating rules inline is how they drift out of sync with
the file that actually governs.

---

## Week 1 — the roster

> We are building the Ontario Primary Care Capacity Index. Read `CLAUDE.md`,
> `docs/00-product-spec.md`, and `docs/01-architecture.md` before writing any
> code, and treat the invariants in `CLAUDE.md` as binding.
>
> This week's job is **Layer 1 only: the roster.** No crawling, no extraction,
> no UI work. Resist the urge to make progress on later layers — the roster
> being wrong is the failure mode that silently corrupts everything above it.
>
> Build a real roster loader for three catchments: `toronto-east` (dense
> urban), `waterloo` (mid-size), and `timmins` (northern). Target 300–600
> practices total.
>
> Sources, in order of trust:
>
> 1. Ontario's Family Health Team and Community Health Centre location
>    datasets, served via ESRI REST. Fetch them live, do not hand-copy.
> 2. Statistics Canada's Open Database of Healthcare Facilities, as a
>    cross-check only — it is 2019–20 vintage and has coverage gaps.
> 3. The CPSO Physician Register for practice addresses and phone numbers.
>    Check its terms of use before automating anything against it, and tell me
>    what you find rather than deciding on your own.
>
> The hard part is entity resolution, not fetching. One clinic appears under
> four names across three sources — "Riverdale FHT", "Riverdale Family Health
> Team", "Riverdale Family Health Team - Danforth Site", and a bare physician
> address that is really the same front desk. Resolve to the **practice**, the
> unit a patient actually contacts. Write the matcher as a pure, tested
> function over normalized address + phone, with a confidence score and an
> explicit `needs_review` bucket. Do not silently merge below threshold.
>
> Replace the placeholder in `packages/pipeline/data/seeds/` and the stub in
> `src/cli/roster-load.ts`. Extend the `practices` schema only if a real source
> field has nowhere to go — and if you do, generate the migration.
>
> Done means: `pnpm roster:load -- --catchment toronto-east` populates real
> practices from live sources; the matcher has unit tests including at least
> three genuine near-duplicate cases drawn from actual data you fetched; the
> `needs_review` count is reported at the end of the run; `pnpm lint`,
> `pnpm typecheck`, `pnpm test` and `pnpm eval` are all green; and `docs/` and
> `.env.example` reflect anything new.
>
> Work on a branch, open a PR, and tell me the `needs_review` rate before you
> merge — if it is above 10% the matcher needs work, not a lower threshold.

---

## The standing preamble

Prepend to any session in this repo:

> Read `CLAUDE.md` first; its invariants are binding and violating one is
> grounds to stop and ask rather than work around. Everything ships from a git
> push: work on a branch, keep `main` deployable, open a PR, and make sure
> `pnpm lint && pnpm typecheck && pnpm test && pnpm eval` is green before you
> ask me to merge. No new external service without an ADR in `docs/adr/`. If a
> change cannot be undone with `git revert`, say so before you make it.

---

## Later weeks

Write these when you get there, not now — each should be informed by what the
previous week actually found.

- **Week 2 — evidence.** Move the crawl loop into the cron route so CLI and
  cron share one implementation. Add booking-platform detection. Page through
  with a cursor rather than raising `maxDuration`.
- **Week 3 — extraction.** Tune against real snapshots. Every disagreement you
  find by hand becomes a fixture in `packages/pipeline/src/eval/fixtures/`.
- **Week 4 — the audit.** 100 random calls. This is the week that decides
  whether the company is real. Do not skip it and do not let the sample stop
  being random. Before you report a precision number, read "What the roster
  covers — and what it does not" in `docs/00-product-spec.md`: the sample is
  random *within team-based primary care* and random nowhere else, and the
  roster is biased toward the practices patients can already find.
- **Week 5 — the surface.** Map, filters, watch signup, correction flow.
- **Week 6 — publish.** The census report, then launch.
