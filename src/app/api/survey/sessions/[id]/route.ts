import { getDb } from "@/lib/db";
import { getSessionView } from "@/lib/survey/service";
import { getPrincipal, run } from "@/lib/server";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { id } = await ctx.params;
    return getSessionView(getDb(), await getPrincipal("peserta"), id);
  });
}
