# Architecture

Six layers. Each independently testable. Value compounds downward — L5 is what
nobody else will do, and it is what makes L3 and L4 trustworthy.

```
L1  Roster        who exists          open data + CPSO → practices
L2  Evidence      what is published   polite crawl    → snapshots (immutable)
L3  Extraction    what it means       LLM + schema    → ExtractionResult
L4  Freshness     how much to trust   decay + recheck → practices.current_*
L5  Ground truth  the human loop      phone audit     → audit_tasks
L6  Surface       map, watch, correct Next.js         → the public product
```

## Data model

| Table | Role |
| --- | --- |
| `practices` | The roster. Slow-changing. Carries a denormalised read cache so the public map is one indexed query. |
| `snapshots` | Immutable evidence. Never deleted (invariant 7). Prune to cold storage only. |
| `observations` | Append-only status history. **The compounding asset.** |
| `audit_tasks` | The human phone queue — ground truth and the eval set. |
| `watches` | Postal code + email. Nothing else (invariant 3). |
| `corrections` | Patient and practice reports. `kind: delist` is honoured within 24h. |

`observations` is the field that looks like an afterthought and is not. Twelve
months of it answers the question no one in Ontario can currently answer: when
and where does primary-care capacity actually open? It cannot be scraped or
backfilled by a competitor who starts a year behind us.

## Why extraction is per-document

The model reads ONE page and reports what it says. Reconciliation across
conflicting sources happens in `packages/pipeline/src/reconcile.ts`, in code
with an explicit source-weight table. A model asked to weigh conflicting
sources will confabulate a synthesis; a weighted merge in code is auditable and
testable.

## The two guards on hallucination

1. **Schema-level.** `ExtractionResult` refuses any status other than
   `unknown` without a non-empty `evidence_quote`. A model that tries to assert
   an uncited status fails parsing and the record stays `unknown`.
2. **Substring verification.** `quoteAppearsInSource()` requires the quote to
   actually occur in the page text, normalised for whitespace. Cheap, and it
   catches genuine confabulation. A candidate failing this is discarded, not
   downgraded.

Both are exercised by fixtures 004 and 005 in the eval, which fail CI if either
guard is weakened.

## Known limitation: JavaScript-rendered pages

Vercel serverless functions cannot run a headless browser comfortably, so the
v1 crawler is `fetch` + `cheerio` and cannot read JS-rendered booking widgets.
Those practices land in `unknown` and route to the phone queue.

If the week-4 audit shows this gap is material, write
`docs/adr/0002-js-rendering.md` and decide deliberately. Do **not** silently
bolt Playwright onto a serverless function.

## Scheduling

Three Vercel Cron entries in `vercel.json`, each hitting an `/api/cron/*` route
guarded by `CRON_SECRET`:

| Job | Schedule (UTC) | What |
| --- | --- | --- |
| `crawl` | 07:00 | Snapshot practices whose recheck is due |
| `recheck` | 08:00 | Re-extract and update the read cache |
| `alerts` | 12:30 | Notify watchers of transitions to actionable |

No queue, no worker, no container. If a job outgrows `maxDuration`, page
through with a cursor rather than raising the limit — and if that stops
working, that is an ADR, not a quiet infrastructure addition.
