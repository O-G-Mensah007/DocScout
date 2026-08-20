# Doc-Scout

**The Ontario Primary Care Capacity Index** — a continuously re-verified public
record of which Ontario primary-care practices are accepting new patients, where
every claim carries its evidence quote, source URL, and verification date.

Free to patients. Always. The revenue comes from selling the *measurement* to
the organizations whose funding depends on hitting attachment targets.

---

## The one rule

> **The agent verifies. It does not contact.**

Doc-Scout reads what practices already publish. It never sends a message to a
clinic on a patient's behalf, never books an appointment, and never handles
health information. The user makes first contact through the practice's own
stated intake channel.

This is not a v1 simplification to be relaxed later. It is the architectural
decision that keeps the entire regulatory surface at zero — CASL, PHIPA,
booking liability, and supply-side backlash all live in the outreach layer.
See `CLAUDE.md` for the full set of invariants.

---

## Quick start

```bash
pnpm install
cp .env.example .env.local     # fill in DATABASE_URL and ANTHROPIC_API_KEY
pnpm db:migrate
pnpm roster:load -- --catchment toronto-east
pnpm crawl -- --catchment toronto-east --limit 25
pnpm extract -- --catchment toronto-east
pnpm dev
```

Open http://localhost:3000.

## Layout

| Path | What lives there |
| --- | --- |
| `apps/web` | Next.js app — public map, list, watch signup, cron routes |
| `packages/core` | The record schema. Single source of truth, shared by DB and LLM |
| `packages/db` | Drizzle schema, migrations, typed client |
| `packages/pipeline` | roster → crawl → extract → freshness → eval |
| `docs/` | Product spec, architecture, runbook, ADRs, kickoff prompts |

## Deploying

Push to `main`. That is the whole deploy story — see `docs/02-runbook.md`.

## Accounts required

Four, all free tier at v1:

1. **GitHub** — source of truth
2. **Vercel** — hosting, cron, preview deploys (connects to GitHub, auto-deploys)
3. **Neon** — Postgres with branching
4. **Anthropic** — extraction

Optionally **Resend** for alert email. Alerts no-op cleanly without it.

## Licence

Code: MIT. See `LICENSE`.

The capacity dataset is published under an open licence — this is deliberate
strategy, not generosity. The moat is the verification loop and the accumulated
status history, neither of which can be copied from a snapshot.
