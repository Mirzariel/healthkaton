import { updateIndicatorMeta } from "@/lib/standards/registry";
import { getDb } from "@/lib/db";
import { getPrincipal, readJson, run } from "@/lib/server";

/** PATCH { title?, locator?, source_id?, scope? } pada butir dari versi DRAFT. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { id } = await ctx.params;
    const p = await getPrincipal("konsol");
    const b = await readJson(req);
    updateIndicatorMeta(getDb(), p, decodeURIComponent(id), {
      title: typeof b.title === "string" ? b.title : undefined,
      locator: b.locator === null || typeof b.locator === "string" ? (b.locator as string | null) : undefined,
      source_id: b.source_id === null || typeof b.source_id === "string" ? (b.source_id as string | null) : undefined,
      scope: Array.isArray(b.scope) ? b.scope.filter((x): x is string => typeof x === "string") : undefined,
    });
    return { id };
  });
}
