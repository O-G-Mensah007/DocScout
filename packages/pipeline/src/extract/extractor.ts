import Anthropic from "@anthropic-ai/sdk";
import { ExtractionResult } from "@docscout/core";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export type ExtractInput = {
  practiceName: string;
  sourceUrl: string;
  retrievedAt: string;
  pageText: string;
};

export type ExtractOutcome =
  | { ok: true; result: ExtractionResult; model: string }
  | { ok: false; reason: "schema" | "api" | "empty"; detail: string };

const TOOL = {
  name: "report_intake_status",
  description:
    "Report what this single page states about whether the practice is accepting new patients.",
  input_schema: {
    type: "object" as const,
    required: [
      "status", "conditions", "intake_method", "intake_url",
      "intake_phone", "languages", "evidence_quote", "confidence", "reasoning",
    ],
    properties: {
      status: {
        type: "string",
        enum: ["accepting", "accepting_with_conditions", "waitlist_only", "not_accepting", "unknown"],
      },
      conditions: {
        type: "object",
        required: ["geography", "referral_required", "age", "provider_types", "notes"],
        properties: {
          geography: { type: ["string", "null"] },
          referral_required: { type: ["string", "null"], enum: ["hcc", "physician", "self", "other", null] },
          age: { type: ["string", "null"] },
          provider_types: { type: "array", items: { type: "string", enum: ["md", "np", "rn", "other"] } },
          notes: { type: ["string", "null"] },
        },
      },
      intake_method: {
        type: "string",
        enum: ["web_form", "phone", "email", "hcc", "portal", "in_person", "unknown"],
      },
      intake_url: { type: ["string", "null"] },
      intake_phone: { type: ["string", "null"] },
      languages: { type: "array", items: { type: "string" } },
      evidence_quote: {
        type: ["string", "null"],
        description:
          "Verbatim sentence copied exactly from the page. Required unless status is 'unknown'.",
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reasoning: { type: "string", maxLength: 600 },
    },
  },
};

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set. See .env.example.");
    client = new Anthropic({ apiKey });
  }
  return client;
}

export async function extract(input: ExtractInput): Promise<ExtractOutcome> {
  const model = process.env.EXTRACTION_MODEL ?? "claude-sonnet-4-6";

  let raw: unknown;
  try {
    const res = await anthropic().messages.create({
      model,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    });
    const block = res.content.find((c) => c.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      return { ok: false, reason: "empty", detail: "model returned no tool_use block" };
    }
    raw = block.input;
  } catch (err) {
    return { ok: false, reason: "api", detail: err instanceof Error ? err.message : String(err) };
  }

  // Invariant 2 is enforced HERE. A model that tries to assert an uncited
  // status fails parsing and the record stays `unknown`. This is the point.
  const parsed = ExtractionResult.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: "schema", detail: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  return { ok: true, result: parsed.data, model };
}

/**
 * Guard against the most damaging failure mode: a quote the model invented.
 * We require the quote to actually appear in the page text (normalised for
 * whitespace). Cheap, and it catches genuine confabulation.
 */
export function quoteAppearsInSource(quote: string, pageText: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return norm(pageText).includes(norm(quote));
}
