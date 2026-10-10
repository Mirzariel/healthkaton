import { listSessions } from "@/lib/ai/admin";
import { getDb } from "@/lib/db";
import { getPrincipal, run } from "@/lib/server";

export async function GET(req: Request) {
  return run(async () => {
    const u = new URL(req.url);
    return listSessions(getDb(), await getPrincipal("konsol"), { status: u.searchParams.get("status") || undefined, stage: u.searchParams.get("stage") || undefined, ai_mode: u.searchParams.get("ai_mode") || undefined, limit: Number(u.searchParams.get("limit")) || undefined, offset: Number(u.searchParams.get("offset")) || undefined });
  });
}
