import { getDb } from "@/lib/db";
import { requestHelp } from "@/lib/survey/participant";
import { getPrincipal, readJson, run, str } from "@/lib/server";

export async function POST(req: Request) {
  return run(async () => {
    const p = await getPrincipal("peserta");
    const b = await readJson(req);
    return requestHelp(getDb(), p, { session_id: str(b.session_id) || undefined, episode_id: str(b.episode_id) || undefined, reason: str(b.reason), idem_key: str(b.idem_key) || undefined });
  });
}
