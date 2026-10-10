import { sessionTrace } from "@/lib/ai/admin";
import { getDb } from "@/lib/db";
import { getPrincipal, run } from "@/lib/server";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return run(async () => sessionTrace(getDb(), await getPrincipal("konsol"), (await ctx.params).id));
}
