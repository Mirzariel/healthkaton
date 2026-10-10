import { saveCardPolicy } from "@/lib/cards/compute";
import { getDb } from "@/lib/db";
import { getPrincipal, readJson, run, str } from "@/lib/server";

/** POST { params, note }: buat versi parameter kartu BARU (draft) lalu hitung ulang. Versi lama tidak berubah. */
export async function POST(req: Request) {
  return run(async () => {
    const p = await getPrincipal("konsol");
    const b = await readJson(req);
    return saveCardPolicy(getDb(), p, b.params, str(b.note));
  });
}
