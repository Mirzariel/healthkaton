import { getDb } from "@/lib/db";
import { getHome } from "@/lib/survey/participant";
import { getPrincipal, run } from "@/lib/server";

export async function GET() {
  return run(async () => getHome(getDb(), await getPrincipal("peserta")));
}
