import type Database from "better-sqlite3";
import type { Principal } from "../auth/principal";
import { DomainError } from "../idem";
import { DOC_MAX_BYTES, addDocument } from "./workflow";

/* Penanganan unggahan multipart untuk portal faskes dan ruang kasus. Jenis berkas ditentukan dari isi (workflow.addDocument).
   Teks PDF diekstrak di server dengan unpdf; PDF tanpa teks (pindaian) dan gambar masuk jalur transkripsi manual. Tidak ada OCR. */

async function pdfText(bytes: Buffer): Promise<{ text: string | null; pages: number | null }> {
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return { text: null, pages: null };
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const r = await extractText(pdf, { mergePages: true });
    return { text: typeof r.text === "string" ? r.text : (r.text as string[]).join("\n"), pages: r.totalPages };
  } catch {
    // PDF rusak atau terenkripsi: diperlakukan sebagai berkas tanpa teks yang dapat dibaca
    return { text: null, pages: null };
  }
}

export async function handleUpload(db: Database.Database, p: Principal, form: FormData, facilityId: string) {
  const file = form.get("file");
  if (!(file instanceof File)) throw new DomainError("Berkas belum dipilih.", 422);
  if (file.size > DOC_MAX_BYTES) throw new DomainError(`Berkas terlalu besar (maks. ${DOC_MAX_BYTES / 1024 / 1024} MB).`, 422);
  const bytes = Buffer.from(await file.arrayBuffer());
  const s = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v.trim() ? v.trim().slice(0, 40) : null;
  };
  const { text, pages } = await pdfText(bytes);
  return addDocument(db, p, { facilityId, name: file.name || "dokumen", bytes, declaredMime: file.type || undefined, clarificationId: s("clarificationId"), findingId: s("findingId"), pdfText: text, pdfPages: pages });
}
