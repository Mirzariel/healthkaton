import { assertCan } from "@/lib/auth/principal";
import { recomputeCards } from "@/lib/cards/compute";
import { getDb } from "@/lib/db";
import { getPrincipal, run } from "@/lib/server";

/** POST: hitung ulang seluruh kartu dengan kebijakan aktif (mis. setelah data berubah). Hasil lama diperbarui, id kartu tetap. */
export async function POST() {
  return run(async () => {
    const p = await getPrincipal("konsol");
    assertCan(p, "cards.configure");
    return recomputeCards(getDb(), p);
  });
}
