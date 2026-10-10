import { getDb } from "@/lib/db";
import { createDirectedInvitation } from "@/lib/survey/participant";
import { getPrincipal, readJson, run, str } from "@/lib/server";

/** Petugas (case.work) mengirim satu konfirmasi terarah ke peserta untuk satu layanan. Hanya menambah/mengurangi sinyal; tidak memutuskan apa pun. */
export async function POST(req: Request) {
  return run(async () => {
    const p = await getPrincipal("konsol");
    const b = await readJson(req);
    return { id: createDirectedInvitation(getDb(), p, { episode_id: str(b.episode_id), service_id: str(b.service_id) }) };
  });
}
