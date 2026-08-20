import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { crawlDelayMs, mayCrawl, userAgent } from "./robots";

export type FetchOutcome =
  | { ok: true; url: string; httpStatus: number; text: string; contentHash: string; retrievedAt: string }
  | { ok: false; url: string; reason: "robots" | "http" | "network" | "too_large"; httpStatus?: number };

const MAX_BYTES = 2_000_000;
const lastHitByOrigin = new Map<string, number>();

async function respectDelay(origin: string): Promise<void> {
  const delay = await crawlDelayMs(origin);
  const last = lastHitByOrigin.get(origin) ?? 0;
  const wait = last + delay - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHitByOrigin.set(origin, Date.now());
}

/**
 * Fetch one page politely and reduce it to readable text.
 *
 * Known limitation, deliberately accepted (see CLAUDE.md): this cannot read
 * JavaScript-rendered booking widgets. Those practices land in `unknown` and
 * route to the human phone queue. Do not bolt a headless browser onto a
 * serverless function to fix it — write ADR 0002 first.
 */
export async function fetchPage(url: string): Promise<FetchOutcome> {
  if (!(await mayCrawl(url))) return { ok: false, url, reason: "robots" };

  const origin = new URL(url).origin;
  await respectDelay(origin);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": userAgent(), Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false, url, reason: "network" };
  }

  if (!res.ok) return { ok: false, url, reason: "http", httpStatus: res.status };

  const raw = await res.text();
  if (raw.length > MAX_BYTES) return { ok: false, url, reason: "too_large", httpStatus: res.status };

  return {
    ok: true,
    url: res.url || url,
    httpStatus: res.status,
    text: extractReadableText(raw),
    contentHash: createHash("sha256").update(raw).digest("hex"),
    retrievedAt: new Date().toISOString(),
  };
}

/**
 * Strip chrome and keep prose. The extractor reads this, so anything dropped
 * here is invisible to the model — be conservative about what you remove.
 */
export function extractReadableText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, nav, footer").remove();
  return $("body")
    .text()
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim()
    .slice(0, 40_000);
}

/** Pages most likely to state intake status, in priority order. */
export const CANDIDATE_PATHS = [
  "/new-patients", "/new-patient", "/accepting-new-patients",
  "/patients", "/become-a-patient", "/registration", "/register",
  "/contact", "/about", "/",
] as const;

export function candidateUrls(websiteUrl: string): string[] {
  const out: string[] = [];
  let base: URL;
  try {
    base = new URL(websiteUrl);
  } catch {
    return out;
  }
  for (const p of CANDIDATE_PATHS) out.push(new URL(p, base.origin).toString());
  return [...new Set(out)];
}
