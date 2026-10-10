import { assertCan } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/idem";
import { getRun, runResults } from "@/lib/evaluation/metrics";
import { getPrincipal, run } from "@/lib/server";

/** GET → satu run lengkap: metrik dan hasil per kasus (kutipan jawaban sintetis, bukan data peserta). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { id } = await ctx.params;
    const p = await getPrincipal("konsol");
    assertCan(p, "ai.eval");
    const db = getDb();
    const r = getRun(db, decodeURIComponent(id));
    if (!r) throw new DomainError("Run tidak ditemukan.", 404);
    return { run: r, results: runResults(db, r.id) };
  });
}
