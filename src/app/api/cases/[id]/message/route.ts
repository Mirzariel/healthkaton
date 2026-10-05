import { postMessage } from "@/lib/actions";
import { getDb } from "@/lib/db";
import { getRole, readJson, run, str } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return run(async () => {
    const body = await readJson(req);
    postMessage(getDb(), id, await getRole(), str(body.text));
    return {};
  });
}
