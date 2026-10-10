import { standardsSource } from "@/lib/ai/admin";
import { getDb } from "@/lib/db";
import { getPrincipal, run } from "@/lib/server";

export async function GET() {
  return run(async () => standardsSource(getDb(), await getPrincipal("konsol")));
}
