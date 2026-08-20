# ADR 0002 — JavaScript-rendered intake pages

**Status:** proposed — do not decide before the week-4 audit

## Context

The v1 crawler is `fetch` + `cheerio`. Practices whose new-patient status lives
inside a JS-rendered booking widget (JaneApp, Ocean, Medeo embeds) return
`unknown`.

## The question to answer first

From the week-4 phone audit: **of practices we could not resolve, what share
were unresolvable because of JS rendering, and what share of those were
actually accepting?** That is the size of the prize. Measure it before choosing
a fix.

## Options, if the gap is material

1. **Provider-specific API/endpoint adapters.** Several booking platforms
   expose a JSON endpoint behind the widget. Narrow, cheap, no browser.
   Preferred if it covers the majority.
2. **A separate browser worker** on a container host, invoked by the cron route.
   Adds a service, a bill, and a second deploy target — which is exactly what
   ADR 0001 chose to avoid. Needs a real justification.
3. **Route to the phone queue and accept the cost.** Honest, and possibly
   correct if the affected population is small.

## Do not

Bolt Playwright onto a Vercel serverless function. It will work in development,
time out in production, and fail in a way that looks like a data problem rather
than an infrastructure problem.
