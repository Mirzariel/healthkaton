import { SYSTEM_ACTOR } from "@/lib/cases/core";
import { getDb } from "@/lib/db";
import { assertDocAccess, getDocument, reprocessDocument } from "@/lib/evidence/service";
import { principalFor } from "@/lib/pkbi-server";
import { run } from "@/lib/server";

/** POST: jalankan ekstraksi untuk dokumen yang masih "menunggu diproses", "OCR belum tersedia", atau "gagal" (tanpa usulan teks aktif). Idempoten. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const { id } = await ctx.params;
    const p = await principalFor(req);
    const db = getDb();
    const { document } = getDocument(db, p, id);
    assertDocAccess(p, document.facility_id);
    return { status: await reprocessDocument(db, SYSTEM_ACTOR, id) };
  });
}
