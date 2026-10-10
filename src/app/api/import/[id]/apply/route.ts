import { getDb } from "@/lib/db";
import { applyImport } from "@/lib/import/service";
import { getPrincipal, readJson, run } from "@/lib/server";

/** POST { allowPartial?: boolean }: menerapkan pratinjau. Idempoten menurut pekerjaan impor. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { id } = await ctx.params;
    const p = await getPrincipal("konsol");
    const b = await readJson(req);
    return applyImport(getDb(), p, id, { allowPartial: b.allowPartial === true });
  });
}
