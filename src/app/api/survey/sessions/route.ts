import { getDb } from "@/lib/db";
import { startSession } from "@/lib/survey/service";
import type { Stage } from "@/lib/labels";
import { getPrincipal, readJson, run, str } from "@/lib/server";

export async function POST(req: Request) {
  return run(async () => {
    const p = await getPrincipal("peserta");
    const b = await readJson(req);
    return startSession(getDb(), p, { invitation_id: str(b.invitation_id) || undefined, episode_id: str(b.episode_id) || undefined, stage: (str(b.stage) || undefined) as Stage | undefined, idem_key: str(b.idem_key) || undefined });
  });
}
