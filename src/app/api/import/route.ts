import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/idem";
import { IMPORT_KINDS, type ImportKind } from "@/lib/import/formats";
import { MAX_IMPORT_BYTES, previewImport } from "@/lib/import/service";
import { getPrincipal, readJson, run, str } from "@/lib/server";

/** POST { kind, fileName?, text } atau multipart (kind, file): membuat PRATINJAU (tidak menulis data domain). */
export async function POST(req: Request) {
  return run(async () => {
    const p = await getPrincipal("konsol");
    let kind: string;
    let fileName: string | null = null;
    let text: string;
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const f = await req.formData();
      kind = String(f.get("kind") ?? "");
      const file = f.get("file");
      if (!(file instanceof File)) throw new DomainError("Berkas belum dipilih.", 422);
      if (file.size > MAX_IMPORT_BYTES) throw new DomainError(`Berkas terlalu besar; maksimal ${MAX_IMPORT_BYTES / 1000} KB.`, 422);
      fileName = file.name;
      text = await file.text();
    } else {
      const b = await readJson(req);
      kind = str(b.kind);
      fileName = str(b.fileName) || null;
      text = str(b.text);
    }
    if (!IMPORT_KINDS.includes(kind as ImportKind)) throw new DomainError("Jenis impor tidak dikenal.", 422);
    return previewImport(getDb(), p, { kind: kind as ImportKind, fileName, text });
  });
}
