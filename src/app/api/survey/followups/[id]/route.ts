import { getDb } from "@/lib/db";
import { answerFollowUp } from "@/lib/survey/participant";
import { getPrincipal, readJson, run, str } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { id } = await ctx.params;
    const p = await getPrincipal("peserta");
    const b = await readJson(req);
    answerFollowUp(getDb(), p, { follow_up_id: id, outcome: str(b.outcome) as "resolved" | "still_issue", note: str(b.note) });
    return { id };
  });
}
