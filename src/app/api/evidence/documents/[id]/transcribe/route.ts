import { getDb } from "@/lib/db";
import { transcribeDocument } from "@/lib/evidence/service";
import { DomainError } from "@/lib/idem";
import { principalFor } from "@/lib/pkbi-server";
import { readJson, run } from "@/lib/server";

/** POST { pages: [{ page, text }] }: transkripsi manual untuk dokumen tanpa teks. Hasilnya USULAN yang harus dikonfirmasi orang lain. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { id } = await ctx.params;
    const p = await principalFor(req);
    const b = await readJson(req);
    if (!Array.isArray(b.pages)) throw new DomainError("Isi 'pages' harus berupa daftar halaman.", 422);
    const pages = b.pages.map((x) => ({ page: Number((x as { page?: unknown }).page), text: String((x as { text?: unknown }).text ?? "") }));
    return { extractionIds: transcribeDocument(getDb(), p, id, pages) };
  });
}
