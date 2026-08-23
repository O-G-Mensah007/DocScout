# ADR 0003 — Roster sources and entity resolution

**Status:** accepted (sources 1 and 2) · **open question** (source 3, CPSO) · 2026-08-20

## Context

Layer 1 is the roster: who exists. Everything above it inherits its errors
silently, so the decisions here are worth writing down.

Three sources were named in the week-1 brief, in trust order. What each one
actually turned out to be:

### 1. Ontario MOH service provider locations — accepted, primary

`https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open09/MapServer/26`

Published through Land Information Ontario as an ESRI REST layer, licensed
under the Open Government Licence – Ontario (declared in the layer's
`copyrightText`). Fetched live on every run, paged through `resultOffset`.

11,625 features across 18 service types. Four of those types are primary-care
attachment points — Family Health Team, Community Health Centre, Nurse
Practitioner-Led Clinic, Indigenous Primary Health Care Organization — giving
**585 locations province-wide**. Data quality is high: of those 585, one row is
missing a street address and none is missing a postal code, community, or
geometry.

Two absences matter and are not fixable from this source:

- **No telephone number and no website.** Neither field exists in the layer.
  `practices.phone` and `practices.website_url` therefore load as `NULL`.
- **No solo or group family practices.** FHO and FHG physicians — the majority
  of Ontario primary care — are not funded facilities and do not appear.

### 2. StatCan Open Database of Healthcare Facilities — accepted, cross-check only

`https://www150.statcan.gc.ca/n1/en/pub/13-26-0001/2020001/ODHF_v1.1.zip`

2019–20 vintage, Statistics Canada Open Licence. 220 Ontario primary-care rows
against the province's 585 — the coverage gap the brief predicted.

It is also **not independent evidence**: every Ontario row carries
`provider = "Province of Ontario"`, so ODHF is a second, older transcription of
the same underlying list. That is precisely what makes it useful as a
cross-check and useless as a roster. It is therefore wired so that **it can
never create a practice** — it only attaches to one the province still
publishes. A row that attaches to nothing is counted and reported, not loaded.

### 3. CPSO Physician Register — NOT automated. Decision required.

This is the source that would supply the missing telephone numbers and the
missing solo/group practices. What the terms actually say, checked 2026-08-20:

- CPSO runs a **formal data-sharing process** with a written request form. The
  standardised dataset it releases contains exactly what the roster needs:
  name, CPSO number, primary and secondary practice addresses, municipality,
  postal code, telephone, fax, specialty, language of practice, registration
  status.
  <https://www.cpso.on.ca/public/services/need-college-data>
- Eligibility is limited to continuity of care and health resource management
  and planning. The College states plainly that "research and commercial
  requests will not be eligible."
- The website terms of use grant no reuse licence: use of the site "does not
  grant users ownership, a licence, or any other rights" to its content.
  <https://www.cpso.on.ca/about/accessibility-human-rights-codes/website-terms-of-use>
- `www.cpso.on.ca/robots.txt` is permissive and does not disallow the register
  paths. The register host `register.cpso.on.ca` serves no robots.txt at all.

So robots.txt does not forbid a crawl, and the terms do not contain an explicit
anti-scraping clause. That is not the same as permission. The College built a
process for releasing this data and drew an eligibility line inside it;
crawling would route around a decision the data owner has already made, which
is exactly the behaviour invariant 5 exists so that we never have to defend.

**The open question is a business one, not an engineering one:** Doc-Scout is
free to patients and serves continuity of care (invariant 4), which reads as
eligible; the intended revenue model sells capacity intelligence to Ontario
Health Teams, which may read as commercial. Only the founders can characterise
that, and the honest move is to ask CPSO rather than to infer.

## Decision

1. Fetch source 1 live on every run. It is the only source that creates practices.
2. Use source 2 as a cross-check that can enrich a practice but never create one.
3. **Do not crawl the CPSO register.** `sources/cpso.ts` reads a file that a
   human obtained through the official request (`CPSO_REGISTER_EXTRACT_PATH`)
   and no-ops with a printed explanation when that variable is unset — which is
   the state this repository ships in.
4. Resolve to the **practice**, meaning the front desk a patient contacts, not
   the organisation and not the physician.

## Entity resolution

The matcher is pure and lives in `packages/pipeline/src/roster/match.ts`.
Location is the spine of every decision and name is corroboration only. The
reverse — weighting names — merges sibling sites and quietly deletes practices,
because an FHT's satellites share a name almost exactly.

**Phone is consulted before address.** A telephone number *is* the front desk:
it is the field a patient actually uses, and the only one that separates two
tenants of one building. Address cannot do that job — a medical office building
gives thirty unrelated practices the same civic number, postal code and
coordinates, differing only by a suite that sources drop about half the time.
So where both sides carry a number, it decides:

| Phone | Location | Outcome |
| --- | --- | --- |
| same | compatible | merge, whatever the names say |
| same | > 1 km apart | distinct — an answering service can front several clinics |
| differs | same address, different suites | distinct: two tenants |
| differs | same address, no suite recorded | **review** — a main line and a department line look identical to this |
| absent | same address, different suites | review if one organisation, distinct if two |

Neither open source publishes a telephone number today, so this path is mostly
dormant. It will not stay dormant: physician-level data is overwhelmingly
solo and group practices at shared addresses, and that is the shape the matcher
has to be right about before the CPSO extract arrives, not after.

Three further rules carry most of the weight, and each was derived from a real
failure against real rows:

- **Written address beats geocode.** A Canadian postal code is
  building-precise. ODHF places `629 markham rd unit 2, M1H 2A4` 2.4 km from
  where the province puts the same address. Trusting the coordinate splits one
  practice in two.
- **Two rows from one feed, at different civic numbers, are two places.** The
  province publishing 38 Pine Street North and 206 Fifth Avenue simultaneously
  is a positive statement that Timmins Academic FHT runs two clinics. The
  relocation reading is only available *across* feeds of different vintage.
- **A unit letter is noise across feeds and signal within one.** MOH's
  `10B Victoria Street South` and ODHF's `10 victoria street s` are one
  building.

### Thresholds

| Band | Score | Behaviour |
| --- | --- | --- |
| merge | ≥ 0.90 | Rows are combined into one practice |
| review | 0.60 – 0.90 | **Left unmerged.** Recorded, reported, adjudicated by a human |
| distinct | < 0.60 | Treated as separate practices |

**Do not lower these to shrink the review bucket.** A large review bucket is
visible uncertainty; a lowered threshold converts it into invisible corruption
of every layer above. The correct response is a better signal — each of the
three rules above was added that way, and each one *reduced* the bucket by
being more right, not more permissive.

### What `needs_review` counts

`practices.needs_review` is set when the matcher could not safely decide a
practice's **composition** — where deciding wrong would create a duplicate or
merge away a real practice. An unresolved link to the cross-check source cannot
do either (it can never create a practice), so it is reported separately as a
stale-address advisory and appears in `review_reasons` without setting the flag.

Both numbers are printed at the end of every run. Neither is hidden.

## Schema changes

Five columns added to `practices`, each because a real source field or a real
resolution outcome had nowhere to go. Migration
`packages/db/migrations/0000_hard_karnak.sql`.

| Column | Why |
| --- | --- |
| `address_line2` | MOH `ADDRESS_LINE_2`. Two practices routinely share a street address and differ only by suite |
| `source_refs` | Which source rows resolved into this practice, what each called it, when read. The roster's evidence trail |
| `match_confidence` | The lowest merge score used to form the practice |
| `needs_review` | The unresolved bucket, made queryable |
| `review_reasons` | Why, in words, for the person adjudicating |

`source_refs` is the one worth defending: the product's whole claim is that
every assertion carries its evidence. "This practice exists" is an assertion.

## Consequences

**Accepted:** the roster is 65 practices across the three catchments, not the
300–600 the brief targeted. That gap is entirely the absence of source 3 — the
four funded primary-care types simply do not contain that many locations in
three catchments, and Ontario has only 585 in total. Reaching the target
requires the CPSO decision above, not a different matcher or wider bounds.

**Accepted:** `phone` and `website_url` are `NULL` for every practice. Layer 2
crawls practice websites; with no URL, it has nothing to crawl. **This is a
week-2 blocker and should be the first thing resolved after the CPSO question.**

**Reversible:** everything here is `git revert` plus a re-run. The loader is
idempotent on a deterministic practice id and never deletes rows.
