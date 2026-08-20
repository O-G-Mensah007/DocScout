import { describe, expect, it } from "vitest";
import { ExtractionResult } from "./record";

const base = {
  conditions: {
    geography: null,
    referral_required: null,
    age: null,
    provider_types: [],
    notes: null,
  },
  intake_method: "web_form" as const,
  intake_url: "https://example.com/new-patients",
  intake_phone: null,
  languages: ["en"],
  confidence: 0.9,
  reasoning: "The page says panels are open.",
};

describe("Invariant 2 — no claim without a quote", () => {
  it("rejects a non-unknown status with no evidence quote", () => {
    const r = ExtractionResult.safeParse({
      ...base,
      status: "accepting",
      evidence_quote: null,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a whitespace-only quote", () => {
    const r = ExtractionResult.safeParse({
      ...base,
      status: "accepting",
      evidence_quote: "   ",
    });
    expect(r.success).toBe(false);
  });

  it("accepts unknown with no quote", () => {
    const r = ExtractionResult.safeParse({
      ...base,
      status: "unknown",
      evidence_quote: null,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a cited claim", () => {
    const r = ExtractionResult.safeParse({
      ...base,
      status: "accepting",
      evidence_quote: "We are currently accepting new patients.",
    });
    expect(r.success).toBe(true);
  });
});
