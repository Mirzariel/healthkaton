import { getDb } from "@/lib/db";
import { reviewExtraction } from "@/lib/evidence/service";
import { DomainError } from "@/lib/idem";
import { principalFor } from "@/lib/pkbi-server";
import { readJson, run, str } from "@/lib/server";

/** PATCH { action: confirm|correct|reject, correctedText? }: peninjau memutuskan usulan teks. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { id } = await ctx.params;
    const p = await principalFor(req);
    const b = await readJson(req);
    const action = str(b.action);
    if (!["confirm", "correct", "reject"].includes(action)) throw new DomainError("Aksi tidak dikenal.", 422);
    return reviewExtraction(getDb(), p, id, { action: action as "confirm" | "correct" | "reject", correctedText: str(b.correctedText) });
  });
}
