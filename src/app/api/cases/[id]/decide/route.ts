import { decideCase } from "@/lib/actions";
import { getDb } from "@/lib/db";
import { getRole, readJson, run, str } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return run(async () => {
    const body = await readJson(req);
    const correction = typeof body.correction === "number" ? body.correction : Number(str(body.correction)) || 0;
    decideCase(getDb(), id, { decision: str(body.decision), reason: str(body.reason), correction }, await getRole());
    return {};
  });
}
