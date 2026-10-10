import { IMPORT_KINDS, KIND_DEFS, templateFor, type ImportKind } from "@/lib/import/formats";

/** GET: templat impor (CSV, atau JSON untuk standar). Tanpa data sungguhan. */
export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  if (!IMPORT_KINDS.includes(kind as ImportKind)) return Response.json({ ok: false, error: "Jenis impor tidak dikenal." }, { status: 404 });
  const def = KIND_DEFS[kind as ImportKind];
  const ext = def.format === "json" ? "json" : "csv";
  return new Response(templateFor(kind as ImportKind), {
    headers: { "content-type": def.format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8", "content-disposition": `attachment; filename="templat-${kind}.${ext}"`, "x-content-type-options": "nosniff" },
  });
}
