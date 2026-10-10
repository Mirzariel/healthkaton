import { SYSTEM_ACTOR } from "@/lib/cases/core";
import { getDb } from "@/lib/db";
import { processDocument, uploadDocument } from "@/lib/evidence/service";
import { MAX_UPLOAD_BYTES } from "@/lib/evidence/validate";
import { DomainError } from "@/lib/idem";
import { principalFor } from "@/lib/pkbi-server";
import { run } from "@/lib/server";

/** POST multipart (file, episodeId?, facilityId?, caseId?, findingId?, clarificationId?): unggah dokumen bukti lalu ekstraksi. ?as=faskes untuk portal faskes. */
export async function POST(req: Request) {
  return run(async () => {
    const p = await principalFor(req);
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES + 200_000) throw new DomainError(`Berkas terlalu besar; maksimal ${MAX_UPLOAD_BYTES / 1048576} MB.`, 422);
    const f = await req.formData();
    const file = f.get("file");
    if (!(file instanceof File)) throw new DomainError("Berkas belum dipilih.", 422);
    const field = (k: string) => {
      const v = f.get(k);
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    const db = getDb();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const up = uploadDocument(db, p, { name: file.name, mime: file.type, bytes, episodeId: field("episodeId"), facilityId: field("facilityId"), caseId: field("caseId"), findingId: field("findingId"), clarificationId: field("clarificationId") });
    const status = await processDocument(db, SYSTEM_ACTOR, up.id);
    return { ...up, status };
  });
}
