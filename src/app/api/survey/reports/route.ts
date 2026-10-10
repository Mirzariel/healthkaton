import { getDb } from "@/lib/db";
import { createServiceReport, listReports } from "@/lib/survey/participant";
import { getPrincipal, readJson, run, str } from "@/lib/server";

export async function GET() {
  return run(async () => listReports(getDb(), await getPrincipal("peserta")));
}
export async function POST(req: Request) {
  return run(async () => {
    const p = await getPrincipal("peserta");
    const b = await readJson(req);
    return createServiceReport(getDb(), p, { episode_id: str(b.episode_id), category: str(b.category), text: str(b.text), idem_key: str(b.idem_key) || undefined });
  });
}
