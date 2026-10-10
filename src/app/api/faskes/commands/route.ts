import { executeFacilityCommand } from "@/lib/casework/commands";
import { getDb } from "@/lib/db";
import { getPrincipal, readJson, run } from "@/lib/server";

/** POST perintah portal faskes: jawaban klarifikasi, bantahan, dan tindakan perbaikan. Akses lintas faskes ditolak oleh fungsi domain. */
export async function POST(req: Request) {
  return run(async () => {
    const p = await getPrincipal("faskes");
    return executeFacilityCommand(getDb(), p, await readJson(req), req.headers.get("idempotency-key"));
  });
}
