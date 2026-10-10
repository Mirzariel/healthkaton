import { getDb } from "@/lib/db";
import { evaluateClaim, savePrecheckRun } from "@/lib/precheck/evaluate";
import { principalFor } from "@/lib/pkbi-server";
import { readJson, run, str } from "@/lib/server";

/** POST { claimId, save?: boolean }: jalankan pemeriksaan pra-pengajuan; save=true menyimpannya sebagai riwayat. ?as=faskes untuk portal faskes. */
export async function POST(req: Request) {
  return run(async () => {
    const p = await principalFor(req);
    const b = await readJson(req);
    const claimId = str(b.claimId);
    if (b.save === true) return savePrecheckRun(getDb(), p, claimId);
    return { result: evaluateClaim(getDb(), p, claimId) };
  });
}
