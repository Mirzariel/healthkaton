import { getDb } from "@/lib/db";
import { submitAnswer } from "@/lib/survey/service";
import { getPrincipal, num, readJson, run, str } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { id } = await ctx.params;
    const p = await getPrincipal("peserta");
    const b = await readJson(req);
    // injeksi galat TIDAK diterima dari permukaan peserta; hanya sandbox dan seed yang boleh
    return submitAnswer(getDb(), p, { session_id: id, turn_id: str(b.turn_id), revision: num(b.revision), choice: str(b.choice) || undefined, text: str(b.text) || undefined, idem_key: str(b.idem_key) || undefined });
  });
}
