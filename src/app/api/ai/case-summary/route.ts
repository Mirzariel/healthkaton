import { generateCaseSummary } from "@/lib/ai/case-summary";
import { getDb } from "@/lib/db";
import { getPrincipal, readJson, run, str } from "@/lib/server";

/** Draf ringkasan bukti untuk petugas. Hanya menyarankan; tidak mengubah status pembuktian. */
export async function POST(req: Request) {
  return run(async () => {
    const p = await getPrincipal("konsol");
    const b = await readJson(req);
    return generateCaseSummary(getDb(), p, str(b.finding_id));
  });
}
