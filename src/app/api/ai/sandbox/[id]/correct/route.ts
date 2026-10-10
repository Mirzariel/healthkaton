import { correctSandbox } from "@/lib/ai/admin";
import { getDb } from "@/lib/db";
import { getPrincipal, readJson, run, str } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { id } = await ctx.params;
    const b = await readJson(req);
    correctSandbox(getDb(), await getPrincipal("konsol"), id, (Array.isArray(b.facts) ? b.facts : []) as { slot: string; value: string }[], str(b.note));
    return { id };
  });
}
