import { invocationDetail } from "@/lib/ai/admin";
import { getDb } from "@/lib/db";
import { getPrincipal, run } from "@/lib/server";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return run(async () => invocationDetail(getDb(), await getPrincipal("konsol"), (await ctx.params).id));
}
