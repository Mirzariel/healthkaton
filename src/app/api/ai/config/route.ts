import { listConfigs, saveConfig } from "@/lib/ai/admin";
import { getDb } from "@/lib/db";
import { getPrincipal, readJson, run } from "@/lib/server";

export async function GET() {
  return run(async () => listConfigs(getDb(), await getPrincipal("konsol")));
}
export async function POST(req: Request) {
  return run(async () => ({ version: saveConfig(getDb(), await getPrincipal("konsol"), await readJson(req)) }));
}
