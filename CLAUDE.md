# CLAUDE.md — Doc-Scout project constitution

Read this before touching anything. It encodes decisions that were expensive to
reach and are cheap to accidentally undo.

---

## What this project is

Doc-Scout is the **Ontario Primary Care Capacity Index**: a continuously
re-verified public record of which Ontario primary-care practices are accepting
new patients, where every claim carries its evidence quote, source URL, and
verification timestamp.

It is free to patients, permanently. Revenue comes later from selling capacity
intelligence to Ontario Health Teams and primary-care planners — organisations
measured on attachment targets who currently have no capacity visibility.

We are not building a search agent. We are building the dataset that Ontario
does not have and cannot easily build.

---

## Invariants — do not violate without an ADR

These are not preferences. Each one closes a legal, ethical, or commercial risk
that would otherwise be existential. If a task appears to require breaking one,
stop and raise it rather than working around it.

1. **The agent verifies, it does not contact.** No automated outreach to
   practices on behalf of patients. No email, no SMS, no form submission, no
   phone automation. The user makes first contact through the practice's own
   published intake channel. This eliminates CASL exposure, booking liability,
   and supply-side backlash in one stroke.

2. **No claim without a verbatim quote.** The extractor may not emit a status it
   cannot cite from the source document. This is enforced at the schema level in
   `packages/core`, not by prompt instruction. If a change would let an
   unciteable status through, the change is wrong.

3. **No personal health information. Ever.** We store postal code and a contact
   address for alerts. We do not store health card numbers, conditions,
   medications, diagnoses, or anything a reasonable person would call medical.
   PHIPA obligations are avoided by never touching the data, not by securing it.

4. **Patients never pay.** No freemium tier, no campaign fee, no priority
   anything. Charging patients for access to insured care is politically
   radioactive in Ontario and would permanently foreclose the public-sector
   sale, which is the actual business.

5. **Crawl politely, always.** Honour `robots.txt`. Rate-limit per domain.
   Identify the bot honestly in the User-Agent with a working contact address.
   Never crawl a page behind authentication. We will be citing this behaviour in
   a procurement questionnaire one day.

6. **A practice can be delisted within 24 hours, no argument.** Self-serve, no
   justification required, no retention attempt. The cost is a handful of
   records. The benefit is a neutral supply side, which is worth more than any
   feature.

7. **Snapshots are immutable and never deleted.** They are the audit trail, the
   regression corpus, and the evidence we show a sceptical clinic manager. Prune
   by moving to cold storage, never by dropping rows.

8. **Freshness is shown, never hidden.** Every status displayed to a user shows
   how old it is in plain language. `unknown` is a legitimate, first-class state
   and must render honestly. The volunteer directories fail precisely because
   they present stale data as current — that failure is our whole opportunity.

9. **Link to Health Care Connect prominently.** We complement the provincial
   service, we do not compete with it. Being visibly complementary is a
   strategic asset in every government conversation we will ever have.

---

## Standing engineering constraints

**Everything lives on GitHub and ships to production from a git push.** That is
the operating constraint for every piece of work from here on. Concretely:

- `main` is always deployable. Vercel deploys it automatically on push.
- Every change arrives through a PR with a preview deploy. CI must be green.
- No step in the deploy path may require a human running a command on a laptop,
  clicking through a console, or holding knowledge that is not in `docs/`.
- No new external service without an ADR. Every added service is an account
  someone has to own, pay for, monitor, and eventually migrate off.
- Configuration lives in environment variables, documented in `.env.example`.
  If you add a variable, add it there in the same commit or CI will fail.
- Migrations are files in `packages/db/migrations`, applied by
  `pnpm db:migrate`. Never mutate production schema by hand.
- Anything that must run on a schedule is a Vercel Cron entry in `vercel.json`
  hitting an `/api/cron/*` route guarded by `CRON_SECRET`. No separate worker
  infrastructure without an ADR.

**Rollback is `git revert` plus a push.** If a change cannot be undone that way
— a destructive migration, a one-way data transform — it needs an ADR and an
explicit backout plan written before it merges.

---

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Language | TypeScript, Node 22 | One language across web and pipeline. Fewer runtimes to operate. |
| Web | Next.js 15, App Router | Server components suit a read-mostly public map. Vercel-native. |
| Hosting | Vercel | Git push to production. Preview deploys per PR. Cron included. |
| Database | Neon Postgres + Drizzle | Branching makes migrations safe to rehearse. SQL, not an ORM DSL. |
| Validation | Zod | One schema drives DB types, API contracts, and LLM structured output. |
| Extraction | Anthropic API | Structured outputs against the Zod schema. |
| Scheduling | Vercel Cron | Already there. No queue, no worker, no container. |
| Tests | Vitest | Fast, minimal config. |

Known limitation, deliberately accepted: Vercel serverless functions cannot run
a headless browser comfortably, so the v1 crawler is `fetch` + `cheerio` and
cannot read JavaScript-rendered booking widgets. Those practices land in
`unknown` and route to the human phone queue. If the week-4 audit shows this
gap is material, `docs/adr/0002-js-rendering.md` is where that decision gets
made — do not silently bolt Playwright onto a serverless function.

---

## How to work in this repo

- Read `docs/00-product-spec.md` before proposing product changes.
- Read `docs/01-architecture.md` before proposing structural changes.
- The record schema in `packages/core/src/record.ts` is the centre of the
  system. Changing it is a schema migration, an extractor change, an eval
  change, and a UI change. Treat it accordingly.
- Add an ADR in `docs/adr/` for: a new external service, a stack change, a
  change to any invariant above, or any decision a future maintainer would
  otherwise have to reverse-engineer.
- Write the test with the fixture, not after. Extraction changes without a
  corresponding golden-set fixture will regress silently.

## The metric that matters

**Precision**: of practices marked `accepting` or `accepting_with_conditions`,
the share confirmed accepting by a human phone call against a *random* audit
sample. Target > 85%.

Measure it against a random sample, never against the records you already
suspected were wrong. It is the easiest metric in this domain to accidentally
inflate, and a health-system buyer's analyst will find the inflation.

## Definition of done

A change is done when it is merged to `main`, CI is green, the preview deploy
was checked by a human, `.env.example` and `docs/` reflect any new
configuration or behaviour, and — if it touched extraction — the eval still
passes on the golden set.
