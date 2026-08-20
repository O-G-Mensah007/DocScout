# Runbook

## Deploying

Push to `main`. That is the whole story.

```bash
git checkout -b feat/thing
# ...work...
git push -u origin feat/thing     # → CI + a Vercel preview deploy
# open a PR, review the preview, merge
# → main deploys to production automatically
```

**Rollback** is `git revert <sha> && git push`. If a change cannot be undone
that way — a destructive migration, a one-way data transform — it needs an ADR
and a written backout plan before it merges.

## First-time setup

Four accounts, all free tier at v1.

### 1. GitHub

```bash
cd docscout
git init && git add -A && git commit -m "Initial commit: Doc-Scout scaffold"
gh repo create docscout --private --source=. --push
# or: create the repo in the web UI, then
#   git remote add origin git@github.com:<you>/docscout.git
#   git push -u origin main
```

### 2. Neon (Postgres)

1. Create a project at neon.tech.
2. Copy the **pooled** connection string into `DATABASE_URL`.
3. Create a branch named `dev` for local work so you never touch prod data.

```bash
cp .env.example .env.local   # paste DATABASE_URL and ANTHROPIC_API_KEY
pnpm install
pnpm db:generate             # writes packages/db/migrations
pnpm db:migrate
```

### 3. Vercel

1. Import the GitHub repo at vercel.com/new.
2. Root directory: `apps/web`. Framework: Next.js. Build settings are detected.
3. Add environment variables (Production **and** Preview):
   `DATABASE_URL`, `ANTHROPIC_API_KEY`, `EXTRACTION_MODEL`, `CRON_SECRET`,
   `CRAWLER_CONTACT_EMAIL`, `CRAWLER_USER_AGENT`, `NEXT_PUBLIC_SITE_URL`.
4. Generate the cron secret with `openssl rand -hex 32`.
5. Deploy. Cron entries in `vercel.json` register automatically.

### 4. Anthropic

Create a key at console.anthropic.com, set `ANTHROPIC_API_KEY`.

## Running the pipeline locally

```bash
pnpm roster:load -- --catchment toronto-east --dry-run   # fetch + resolve, write nothing
pnpm roster:load -- --catchment toronto-east
pnpm crawl      -- --catchment toronto-east --limit 25
pnpm extract    -- --catchment toronto-east
pnpm audit:export -- --catchment toronto-east --n 100 > audit.csv
```

`roster:load` fetches live from Ontario open data on every run and prints a
`needs_review` count at the end; it exits non-zero above 10%. `--dry-run` needs
no `DATABASE_URL`, which makes it the fastest way to check a matcher change.
See `docs/04-roster.md`, and read
`docs/adr/0003-roster-sources-and-entity-resolution.md` before adding a source
— the CPSO register is deliberately not automated.

`audit.csv` is the week-4 call sheet. Fill in `human_status`, then feed
disagreements back as eval fixtures. That loop — disagreement becomes a
fixture, fixture becomes a regression test — is the moat.

## Verifying a cron route

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<your-deployment>/api/cron/crawl
```

An unauthenticated request must return 401. If it does not, stop and fix it
before anything else — those routes trigger paid work.

## A clinic asks to be delisted

Invariant 6: within 24 hours, no argument, no retention attempt.

```sql
UPDATE practices
   SET delisted_at = now(), crawl_blocked = true
 WHERE id = 'on-tor-000123';
```

Every read path filters on `delisted_at IS NULL`. Reply to confirm it is done.

## Cost watch

The numbers that move: extraction calls per run, snapshot storage, and human
call time. Track cost per verified practice-month from week one. Economics that
work at 500 practices can break at 5,000 — the volatility-weighted recheck in
`nextRecheckDue()` is what is supposed to keep it flat. If it is not working,
that is a real finding, not a tuning problem.
