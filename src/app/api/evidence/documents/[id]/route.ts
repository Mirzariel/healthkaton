import { getDb } from "@/lib/db";
import { readDocumentBytes } from "@/lib/evidence/service";
import { principalFor } from "@/lib/pkbi-server";
import { errorResponse } from "@/lib/server";

/** GET: unduh dokumen (terotorisasi dan dicatat di audit). ?inline=1 hanya untuk gambar. Selalu nosniff + sandbox. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const p = await principalFor(req);
    const d = readDocumentBytes(getDb(), p, id);
    const inline = new URL(req.url).searchParams.get("inline") === "1" && d.mime.startsWith("image/");
    const asciiName = d.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
    return new Response(new Uint8Array(d.bytes), {
      headers: {
        "content-type": d.mime,
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${asciiName}"`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox; default-src 'none'",
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
