/* Validasi unggahan dokumen bukti. Dasarnya ISI berkas (magic bytes), bukan nama atau tipe yang diklaim klien. */

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // di bawah batas badan permintaan fungsi serverless (≈4,5 MB)
export const MAX_PAGES = 50;

export type SniffedType = "pdf" | "png" | "jpeg";
export interface UploadCheck { ok: true; type: SniffedType; mime: string; ext: string; name: string; kind: "pdf" | "image" }
export interface UploadReject { ok: false; message: string }

const MIME: Record<SniffedType, string> = { pdf: "application/pdf", png: "image/png", jpeg: "image/jpeg" };
const EXTS: Record<SniffedType, string[]> = { pdf: ["pdf"], png: ["png"], jpeg: ["jpg", "jpeg"] };

export function sniff(b: Uint8Array): SniffedType | null {
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "pdf";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  return null;
}

/** Nama aman untuk ditampilkan dan disimpan: tanpa jalur, tanpa karakter kontrol, panjang terbatas. */
export function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
  return cleaned || "dokumen";
}

/* PDF dengan skrip atau aksi otomatis ditolak (pertahanan berlapis; dokumen akan diunduh petugas). */
const PDF_ACTIVE = [/\/JavaScript\b/, /\/JS\b/, /\/Launch\b/, /\/OpenAction\b/, /\/AA\b/, /\/EmbeddedFile\b/, /\/RichMedia\b/];

export function validateUpload(input: { name: string; mime: string; bytes: Uint8Array }): UploadCheck | UploadReject {
  const { bytes } = input;
  if (!bytes.length) return { ok: false, message: "Berkas kosong." };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, message: `Berkas terlalu besar (${(bytes.length / 1048576).toFixed(1)} MB). Maksimal ${MAX_UPLOAD_BYTES / 1048576} MB.` };
  const type = sniff(bytes);
  if (!type) return { ok: false, message: "Isi berkas bukan PDF, PNG, atau JPEG. Hanya tiga tipe itu yang diterima." };
  const name = safeName(input.name);
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (!EXTS[type].includes(ext)) return { ok: false, message: `Ekstensi ".${ext || "(kosong)"}" tidak sesuai dengan isi berkas (${type.toUpperCase()}).` };
  const declared = input.mime.split(";")[0].trim().toLowerCase();
  if (declared && declared !== "application/octet-stream" && declared !== MIME[type] && !(type === "jpeg" && declared === "image/jpg")) {
    return { ok: false, message: `Tipe yang dikirim (${declared}) tidak sesuai dengan isi berkas (${MIME[type]}).` };
  }
  if (type === "pdf") {
    const text = Buffer.from(bytes).toString("latin1");
    const hit = PDF_ACTIVE.find((re) => re.test(text));
    if (hit) return { ok: false, message: "PDF berisi skrip, aksi otomatis, atau lampiran tertanam. Berkas ditolak; ekspor ulang sebagai PDF biasa." };
  }
  return { ok: true, type, mime: MIME[type], ext, name, kind: type === "pdf" ? "pdf" : "image" };
}
