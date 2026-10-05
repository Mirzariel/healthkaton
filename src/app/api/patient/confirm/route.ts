import { confirmService } from "@/lib/actions";
import { autopilotAfterChange } from "@/lib/autopilot";
import { getDb } from "@/lib/db";
import { readJson, run, str } from "@/lib/server";

export async function POST(req: Request) {
  return run(async () => {
    const b = await readJson(req);
    const db = getDb();
    const participantId = str(b.participant_id);
    const changes = confirmService(db, str(b.service_id), participantId, str(b.answer), str(b.note));
    // Mode otomatis: jawaban peserta langsung memicu keputusan untuk kasus miliknya.
    const auto = autopilotAfterChange(db, { participantId });
    return { changes, auto };
  });
}
