import { activateConfig } from "@/lib/ai/admin";
import { getDb } from "@/lib/db";
import { getPrincipal, readJson, run, str } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ version: string }> }) {
  return run(async () => {
    const { version } = await ctx.params;
    const b = await readJson(req);
    activateConfig(getDb(), await getPrincipal("konsol"), Number(version), str(b.note));
    return { version: Number(version) };
  });
}
