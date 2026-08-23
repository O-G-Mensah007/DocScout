import { db, watches } from "@docscout/db";
import { z } from "zod";

const WatchInput = z.object({
  email: z.string().email(),
  postal: z.string().min(3).max(7).transform((s) => s.toUpperCase().replace(/\s/g, "")),
  radiusKm: z.number().int().min(1).max(50).default(10),
  languages: z.array(z.string()).default([]),
  acceptNp: z.boolean().default(true),
  acceptConditional: z.boolean().default(true),
});

/**
 * POST /api/watch — sign up for alerts when a practice near you starts accepting.
 *
 * Invariant 3: we store postal code and a contact address. Nothing else.
 * Invariant 4: patients never pay.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = WatchInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const input = parsed.data;

  try {
    await db()
      .insert(watches)
      .values({
        email: input.email,
        postal: input.postal,
        radiusKm: input.radiusKm,
        languages: input.languages,
        acceptNp: input.acceptNp,
        acceptConditional: input.acceptConditional,
      })
      .onConflictDoUpdate({
        target: [watches.email, watches.postal],
        set: {
          radiusKm: input.radiusKm,
          languages: input.languages,
          acceptNp: input.acceptNp,
          acceptConditional: input.acceptConditional,
        },
      });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
