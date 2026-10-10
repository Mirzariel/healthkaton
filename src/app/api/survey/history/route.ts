import { getDb } from "@/lib/db";
import { answerHistory } from "@/lib/survey/participant";
import { getPrincipal, run } from "@/lib/server";

export async function GET() {
  return run(async () => answerHistory(getDb(), await getPrincipal("peserta")));
}
