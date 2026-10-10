import { modelStats } from "@/lib/ai/admin";
import { getDb } from "@/lib/db";
import { getPrincipal, run } from "@/lib/server";

export async function GET() {
  return run(async () => modelStats(getDb(), await getPrincipal("konsol")));
}
