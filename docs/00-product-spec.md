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

## Success criteria for v1

| Metric | Target | Notes |
| --- | --- | --- |
| Precision | > 85% | Of actionable claims, share confirmed by phone on a **random** sample |
| Coverage | > 80% | Share of rostered practices with a status that is not `unknown` |
| Freshness | < 14d median | Age of verified status across the index |
| Discovery rate | measure it | Openings per 1,000 practices per month. Nobody knows this number |
| Watch conversion | measure it | Alert → contact → self-reported attachment |
| Cost / practice-month | measure it | Compute + storage + human calls. The margin story |

Two of these have no known value today. That is the reason the project is
interesting, not a gap in the plan.
