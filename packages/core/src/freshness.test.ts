import { describe, expect, it } from "vitest";
import { decayedConfidence, freshnessBand, freshnessLabel, nextRecheckDue } from "./freshness";
import type { StatusObservation } from "./record";

const NOW = new Date("2026-08-20T12:00:00-04:00");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("freshness", () => {
  it("bands by age", () => {
    expect(freshnessBand(daysAgo(0), NOW)).toBe("today");
    expect(freshnessBand(daysAgo(4), NOW)).toBe("days");
    expect(freshnessBand(daysAgo(20), NOW)).toBe("weeks");
    expect(freshnessBand(daysAgo(90), NOW)).toBe("stale");
    expect(freshnessBand(null, NOW)).toBe("unknown");
  });

  it("never overstates freshness in its label", () => {
    expect(freshnessLabel(daysAgo(0), NOW)).toBe("Verified today");
    expect(freshnessLabel(daysAgo(3), NOW)).toBe("Verified 3 days ago");
    expect(freshnessLabel(null, NOW)).toBe("Not yet verified");
  });

  it("decays an accepting claim faster than a not_accepting one", () => {
    const a = decayedConfidence(0.9, "accepting", daysAgo(20), NOW);
    const b = decayedConfidence(0.9, "not_accepting", daysAgo(20), NOW);
    expect(a).toBeLessThan(b);
  });

  it("shortens the recheck interval for volatile practices", () => {
    const stable: StatusObservation[] = [
      { status: "not_accepting", observed_at: daysAgo(300), method: "automated_extraction" },
      { status: "not_accepting", observed_at: daysAgo(100), method: "automated_extraction" },
    ];
    const volatile: StatusObservation[] = [
      { status: "not_accepting", observed_at: daysAgo(300), method: "automated_extraction" },
      { status: "accepting", observed_at: daysAgo(200), method: "automated_extraction" },
      { status: "not_accepting", observed_at: daysAgo(100), method: "automated_extraction" },
      { status: "accepting", observed_at: daysAgo(10), method: "automated_extraction" },
    ];
    const s = nextRecheckDue("not_accepting", stable, NOW).getTime();
    const v = nextRecheckDue("not_accepting", volatile, NOW).getTime();
    expect(v).toBeLessThan(s);
  });
});
