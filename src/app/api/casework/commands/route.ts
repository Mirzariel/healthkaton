import { executeStaffCommand } from "@/lib/casework/commands";
import { getDb } from "@/lib/db";
import { getPrincipal, readJson, run } from "@/lib/server";

/** POST perintah ruang kasus. Header `Idempotency-Key` (opsional) mencegah efek ganda saat dikirim ulang. Wewenang diperiksa oleh fungsi domain. */
export async function POST(req: Request) {
  return run(async () => {
    const p = await getPrincipal("konsol");
    return executeStaffCommand(getDb(), p, await readJson(req), req.headers.get("idempotency-key"));
  });
}
