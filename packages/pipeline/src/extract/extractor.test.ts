import { describe, expect, it } from "vitest";
import { quoteAppearsInSource } from "./extractor";

describe("quoteAppearsInSource", () => {
  it("finds an exact match", () => {
    expect(
      quoteAppearsInSource(
        "We are accepting new patients.",
        "Welcome to our clinic. We are accepting new patients. Please call.",
      ),
    ).toBe(true);
  });

  it("normalises whitespace differences", () => {
    expect(
      quoteAppearsInSource(
        "We are accepting new patients.",
        "We  are   accepting\n  new\tpatients.",
      ),
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(
      quoteAppearsInSource(
        "We Are Accepting New Patients.",
        "we are accepting new patients.",
      ),
    ).toBe(true);
  });

  it("rejects a quote not in the source", () => {
    expect(
      quoteAppearsInSource(
        "We are welcoming new clients.",
        "Our waitlist for new clients is currently closed.",
      ),
    ).toBe(false);
  });

  it("rejects a paraphrased quote", () => {
    expect(
      quoteAppearsInSource(
        "New patients are being accepted at this time.",
        "We are currently accepting new patients at our Danforth location.",
      ),
    ).toBe(false);
  });

  it("handles empty quote", () => {
    expect(quoteAppearsInSource("", "Some page text")).toBe(true);
  });

  it("handles empty page", () => {
    expect(quoteAppearsInSource("A real quote", "")).toBe(false);
  });
});
