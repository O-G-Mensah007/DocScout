import { describe, expect, it } from "vitest";
import { reconcile, type Candidate } from "./reconcile";
import type { ExtractionResult } from "@docscout/core";

const result = (status: ExtractionResult["status"], confidence = 0.9): ExtractionResult => ({
  status,
  conditions: { geography: null, referral_required: null, age: null, provider_types: [], notes: null },
  intake_method: "web_form",
  intake_url: null,
  intake_phone: null,
  languages: [],
  evidence_quote: status === "unknown" ? null : "quote",
  confidence,
  reasoning: "test",
});

const cand = (over: Partial<Candidate>): Candidate => ({
  result: result("accepting"),
  sourceUrl: "https://example.com",
  sourceType: "practice_website",
  retrievedAt: new Date().toISOString(),
  quoteVerified: true,
  ...over,
});

describe("reconcile", () => {
  it("returns unknown when nothing usable", () => {
    expect(reconcile([]).status).toBe("unknown");
    expect(reconcile([cand({ result: result("unknown") })]).status).toBe("unknown");
  });

  it("discards candidates whose quote could not be found in the source", () => {
    const r = reconcile([cand({ quoteVerified: false })]);
    expect(r.status).toBe("unknown");
  });

  it("prefers the intake form over the marketing page", () => {
    const r = reconcile([
      cand({ sourceType: "practice_website", result: result("not_accepting") }),
      cand({ sourceType: "intake_form", result: result("accepting") }),
    ]);
    expect(r.status).toBe("accepting");
  });

  it("flags disagreement for the phone queue", () => {
    const r = reconcile([
      cand({ sourceType: "practice_website", result: result("not_accepting") }),
      cand({ sourceType: "booking_platform", result: result("accepting") }),
    ]);
    expect(r.disputed).toBe(true);
  });
});
