import robotsParser from "robots-parser";

/**
 * Invariant 5: crawl politely, always.
 *
 * We fetch and cache robots.txt per origin, and we fail CLOSED — if robots.txt
 * cannot be read, we do not crawl. A missing robots.txt is permissive by
 * convention, but a 500 or a timeout is ambiguous, and ambiguity resolves
 * against us. The cost of skipping a practice is one `unknown` record. The
 * cost of being the bot that ignored robots.txt is the government sale.
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type Entry = { robots: ReturnType<typeof robotsParser> | null; fetchedAt: number; ok: boolean };
const cache = new Map<string, Entry>();

export function userAgent(): string {
  return (
    process.env.CRAWLER_USER_AGENT ??
    "DocScoutBot/0.1 (+https://docscout.ca/bot)"
  );
}

export async function loadRobots(origin: string): Promise<Entry> {
  const hit = cache.get(origin);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit;

  const url = `${origin}/robots.txt`;
  let entry: Entry = { robots: null, fetchedAt: Date.now(), ok: false };

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent() },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) {
      // No robots.txt: permissive by convention.
      entry = { robots: null, fetchedAt: Date.now(), ok: true };
    } else if (res.ok) {
      entry = { robots: robotsParser(url, await res.text()), fetchedAt: Date.now(), ok: true };
    }
  } catch {
    // Fail closed. entry.ok stays false.
  }

  cache.set(origin, entry);
  return entry;
}

export async function mayCrawl(target: string): Promise<boolean> {
  let origin: string;
  try {
    origin = new URL(target).origin;
  } catch {
    return false;
  }
  const { robots, ok } = await loadRobots(origin);
  if (!ok) return false;
  if (!robots) return true;
  return robots.isAllowed(target, userAgent()) ?? true;
}

export async function crawlDelayMs(origin: string): Promise<number> {
  const { robots } = await loadRobots(origin);
  const declared = robots?.getCrawlDelay(userAgent());
  // Our own floor is 2s per origin regardless of what robots.txt permits.
  return Math.max(2000, (declared ?? 0) * 1000);
}
