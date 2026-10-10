import { updateQuestionText } from "@/lib/standards/registry";
import { getDb } from "@/lib/db";
import { getPrincipal, readJson, run, str } from "@/lib/server";

/** Ubah kalimat pertanyaan pada versi DRAFT: PATCH { text }. Menghapus tanda tinjauan klinis pada pertanyaan itu. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { id } = await ctx.params;
    const p = await getPrincipal("konsol");
    updateQuestionText(getDb(), p, decodeURIComponent(id), str((await readJson(req)).text));
    return { id };
  });
}
