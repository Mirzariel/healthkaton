import { assertDocumentAccess } from "@/lib/casework/workflow";
import { anyPrincipal } from "@/lib/casework/session";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/server";

/** Isi dokumen bukti. Hanya staf berwenang dan faskes pemilik; peserta tidak pernah. Berkas disajikan sebagai data (tanpa eksekusi). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const db = getDb();
    const p = await anyPrincipal();
    assertDocumentAccess(db, p, id);
    const d = db.prepare("SELECT name, mime, content FROM documents WHERE id = ?").get(id) as { name: string; mime: string; content: Buffer | null };
    if (!d.content) return Response.json({ ok: false, error: "Isi dokumen tidak tersimpan." }, { status: 404 });
    return new Response(new Uint8Array(d.content), {
      headers: {
        "Content-Type": d.mime,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(d.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
