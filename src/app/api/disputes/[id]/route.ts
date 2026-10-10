import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/idem";
import { resolveDispute, type DisputeOutcome } from "@/lib/pending/dispute";
import type { PendingCategory } from "@/lib/pending/triage";
import { getPrincipal, readJson, run, str } from "@/lib/server";

/** POST { outcome: accepted|rejected|noted, response, newCategory? } oleh peninjau. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { id } = await ctx.params;
    const p = await getPrincipal("konsol");
    const b = await readJson(req);
    const outcome = str(b.outcome) as DisputeOutcome;
    if (!["accepted", "rejected", "noted"].includes(outcome)) throw new DomainError("Hasil tidak dikenal.", 422);
    resolveDispute(getDb(), p, id, { outcome, response: str(b.response), newCategory: (str(b.newCategory) || undefined) as PendingCategory | undefined });
    return { id };
  });
}
