import { assertCan } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { syncPendingTriage } from "@/lib/pending/triage";
import { getPrincipal, run } from "@/lib/server";

/** POST: pilah klaim pending yang belum punya baris pemilahan dan tutup yang sudah tidak pending. Idempoten. */
export async function POST() {
  return run(async () => {
    const p = await getPrincipal("konsol");
    assertCan(p, "pending.manage");
    return syncPendingTriage(getDb(), p);
  });
}
