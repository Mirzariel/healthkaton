import { getDb } from "@/lib/db";
import { startEvaluation } from "@/lib/evaluation/runner";
import { getPrincipal, readJson, run } from "@/lib/server";

/** POST { split?, systems?, provider?, idempotency_key?, note? } → menjalankan evaluasi pada dataset tersimpan (wewenang ai.eval dicek di startEvaluation).
    Mode 'live' ditolak 409 bila kunci/adapter tidak tersedia; tidak pernah diganti simulasi diam-diam. */
export async function POST(req: Request) {
  return run(async () => {
    const p = await getPrincipal("konsol");
    const b = await readJson(req);
    const o = await startEvaluation(getDb(), p, b);
    return { replayed: o.replayed, runs: o.runs.map((r) => ({ id: r.id, system: r.system, mode: r.mode, status: r.status, sample_size: r.sample_size, note: r.note })) };
  });
}
