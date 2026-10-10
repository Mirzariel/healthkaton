import { getDb } from "@/lib/db";
import { stopSession } from "@/lib/survey/service";
import { getPrincipal, num, readJson, run, str } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { id } = await ctx.params;
    const p = await getPrincipal("peserta");
    const b = await readJson(req);
    return stopSession(getDb(), p, { session_id: id, revision: num(b.revision), idem_key: str(b.idem_key) || undefined });
  });
}
