import { getDb } from "@/lib/db";
import { fileDispute } from "@/lib/pending/dispute";
import { getPrincipal, readJson, run, str } from "@/lib/server";

/** POST { cardId, text } oleh faskes: bantahan atas kartu. */
export async function POST(req: Request) {
  return run(async () => {
    const p = await getPrincipal("faskes");
    const b = await readJson(req);
    return { id: fileDispute(getDb(), p, { kind: "card", refId: String(Number(b.cardId)), text: str(b.text) }) };
  });
}
