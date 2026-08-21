# Product spec

## One line

A continuously re-verified public map of which Ontario primary-care practices
are accepting new patients — every claim carrying its evidence quote, source
URL, and verification date.

## Who it is for

1. **Patients without a family doctor.** Free, no account required to search.
   The thing they actually want is not search but *watch*: tell me the moment a
   panel opens near me.
2. **Primary-care planners** — Ontario Health Teams, regional offices,
   municipalities. They are measured on attachment targets and have no capacity
   visibility. They are the customer who eventually pays.

## Why it can exist

Nobody publishes this data:

- The CPSO states its Physician Register "does not list what physicians are
  accepting new patients."
- Ontario routes everyone to Health Care Connect and exposes no capacity data.
- Volunteer directories exist, get traffic, and go stale — because manual
  maintenance of a volatile field across thousands of practices is unsustainable
  by hand. **That decay is the product.**

Everyone has the roster. Nobody has the status, because the status rots in
weeks.

## In scope for v1

- Practice roster for three contrasting catchments, entity-resolved to the
  **practice**, not the physician. A doctor's panel status is meaningless to a
  patient; a clinic's intake status is actionable.
- Automated evidence collection from sources practices publish themselves.
- LLM extraction into a strict schema with a mandatory verbatim quote.
- Freshness modelling and volatility-weighted rechecking.
- Human phone-verification queue for ground truth.
- Public map and list with freshness on every record.
- Postal-code watch with notification on transition to accepting.
- One-tap correction from patients and practices.

## Explicitly out of scope

See the invariants in `CLAUDE.md`. Short version: no outreach, no booking, no
PHI, no patient payments, no clinic software, no competing with Health Care
Connect.

## The three catchments

Chosen to contrast, not to maximise coverage:

| Catchment | Why |
| --- | --- |
| `toronto-east` | Dense urban, highest practice density |
| `waterloo` | Mid-size city, mixed FHT/FHO |
| `timmins` | Northern, where unattachment is worst and candidates are fewest |

The GTA is where physician density is highest and unattachment rates are
lowest. Beachhead size and problem severity may be anti-correlated. The census
tests this rather than assuming it.

## What the roster covers — and what it does not

**The roster is team-based primary care only.** This is the single most
important caveat in the project and it must not be discovered late.

Ontario open data lists roughly **585 FHT, CHC, NPLC and AHAC locations**
province-wide. Ontario has roughly **17,300 family physicians**. Those numbers
are not two measures of the same thing, and the gap is not a rounding error —
it is most of primary care. Solo and group practices (FHO, FHG, and
unaffiliated physicians) are not funded facilities, appear in no open dataset,
and are absent from the roster entirely. They exist only in the CPSO Physician
Register, which we do not crawl — see
[ADR 0003](adr/0003-roster-sources-and-entity-resolution.md).

**The bias has a direction. The roster is not a small random sample of Ontario
primary care; it is the most visible slice of it.** Funded team-based
organisations are precisely the ones that already have a website, a
communications budget, a public profile, and often a published intake page. The
practices missing from the roster are disproportionately the ones a patient
already cannot find — which is the population the product exists to serve.

Two consequences, both of which bite before launch:

1. **Week 4 (the audit).** Precision measured against this roster is precision
   on the *findable* half of primary care. The sample is random within
   team-based primary care and random nowhere else. Report it that way. A
   health-system analyst who takes an 85% precision figure as applying to
   Ontario primary care generally will be wrong, and will notice.
2. **Week 6 (the census).** The report covers team-based primary care only, and
   **the title has to say so** — not a footnote, not a methodology appendix.
   Something of the form "*... in Ontario's team-based primary care*". A census
   that silently implies province-wide coverage is the kind of error that
   destroys credibility with exactly the buyer we need, and it is unrecoverable
   once published.

Closing the gap is a data-access decision (CPSO), not an engineering one.

## Success criteria for v1

| Metric | Target | Notes |
| --- | --- | --- |
| Precision | > 85% | Of actionable claims, share confirmed by phone on a **random** sample |
| Coverage | > 80% | Share of **rostered** practices with a status that is not `unknown`. The denominator is team-based primary care only — see above |
| Freshness | < 14d median | Age of verified status across the index |
| Discovery rate | measure it | Openings per 1,000 practices per month. Nobody knows this number |
| Watch conversion | measure it | Alert → contact → self-reported attachment |
| Cost / practice-month | measure it | Compute + storage + human calls. The margin story |

Two of these have no known value today. That is the reason the project is
interesting, not a gap in the plan.
