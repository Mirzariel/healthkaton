import { assertCan } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { evaluationStatus, listRuns } from "@/lib/evaluation/metrics";
import { getPrincipal, run } from "@/lib/server";

/** GET → status kepala dan daftar run (tanpa metrik rinci). */
export async function GET() {
  return run(async () => {
    const p = await getPrincipal("konsol");
    assertCan(p, "ai.eval");
    const db = getDb();
    return { status: evaluationStatus(db), runs: listRuns(db).map(({ metrics: _m, ...r }) => r) };
  });
}
