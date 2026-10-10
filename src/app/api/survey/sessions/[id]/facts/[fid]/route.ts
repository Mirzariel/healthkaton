import { getDb } from "@/lib/db";
import { correctFact } from "@/lib/survey/service";
import { getPrincipal, num, readJson, run, str } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string; fid: string }> }) {
  return run(async () => {
    const { id, fid } = await ctx.params;
    const p = await getPrincipal("peserta");
    const b = await readJson(req);
    return correctFact(getDb(), p, { session_id: id, fact_id: fid, value: str(b.value), revision: num(b.revision), idem_key: str(b.idem_key) || undefined });
  });
}
