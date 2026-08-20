# ADR 0001 — TypeScript monorepo on Vercel

**Status:** accepted · 2026-08-20

## Context

Two-person team, pre-revenue. The standing constraint is that everything lives
on GitHub and ships to production from a git push, with minimal external
support. The system is roughly 30% web surface and 70% data pipeline.

## Decision

A single TypeScript monorepo — Next.js on Vercel, Neon Postgres via Drizzle,
scheduled work as Vercel Cron routes.

## Alternatives considered

**Python pipeline + TypeScript web.** Better data-engineering ergonomics and
first-class Playwright, at the cost of two runtimes, two deploy targets, two
dashboards and two failure modes. Rejected: the ops surface is the scarce
resource here, not the scraping ergonomics.

**All Python on Railway.** Simplest possible ops story, single container.
Rejected: a weaker interactive map, and the frontend is the patient-facing
half of a product whose credibility depends on feeling trustworthy.

## Consequences

Accepted: no headless browser in the crawler at v1 (see
`docs/01-architecture.md`), so JS-rendered booking widgets land in `unknown`.
Revisit only via ADR 0002, with evidence from the week-4 audit.

Gained: one language, one deploy target, preview deploys per PR, cron with no
worker infrastructure, and `git revert` as a complete rollback story.
