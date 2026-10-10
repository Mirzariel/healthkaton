import { testActiveConnection } from "@/lib/ai/admin";
import { getDb } from "@/lib/db";
import { getPrincipal, run } from "@/lib/server";

export async function POST() {
  return run(async () => testActiveConnection(getDb(), await getPrincipal("konsol")));
}
