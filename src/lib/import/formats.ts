import { toCsv } from "./csv";

/* Format impor yang terdokumentasi. Satu sumber untuk templat, validasi, halaman bantuan, dan dokumentasi. */

export type ImportKind = "episode_klaim" | "layanan" | "status_bayar" | "standar";
export const IMPORT_KINDS: ImportKind[] = ["episode_klaim", "layanan", "status_bayar", "standar"];

export interface ColumnDef { name: string; required: boolean | "kondisional"; help: string; example: string }
export interface KindDef {
  label: string;
  format: "csv" | "json";
  description: string;
  order: number;
  columns: ColumnDef[];
  /** Kunci dedup: dua baris dengan kunci sama dianggap data yang sama. */
  dedupe: string;
  notes: string[];
}

const D = "Tanggal ISO: YYYY-MM-DD atau YYYY-MM-DDTHH:MM";

export const KIND_DEFS: Record<ImportKind, KindDef> = {
  episode_klaim: {
    label: "Episode dan klaim",
    format: "csv",
    order: 1,
    description: "Satu baris = satu klaim beserta episode perawatannya. Peserta ditulis sebagai pseudonim; tidak ada nama atau NIK.",
    dedupe: "claim_no (nomor klaim). Nomor yang sama dengan isi identik dilewati; isi berbeda ditolak sebagai konflik.",
    columns: [
      { name: "claim_no", required: true, help: "Nomor klaim unik", example: "KLM-IMP-0001" },
      { name: "facility_code", required: true, help: "Kode faskes yang sudah terdaftar (mis. RSHB)", example: "RSHB" },
      { name: "participant_pseudonym", required: true, help: "Pseudonim peserta (huruf besar, angka, strip; 3–20 karakter)", example: "PSN-IMP001" },
      { name: "kind", required: true, help: "RJTL (rawat jalan) atau RITL (rawat inap)", example: "RITL" },
      { name: "admit_at", required: true, help: D, example: "2026-09-01T10:00" },
      { name: "discharge_at", required: true, help: `${D}; tidak boleh sebelum admit_at`, example: "2026-09-04T11:00" },
      { name: "dx_code", required: true, help: "Kode diagnosis", example: "J18.9" },
      { name: "dx_text", required: false, help: "Uraian diagnosis (bila kode tidak ada di katalog simulasi, wajib)", example: "Pneumonia" },
      { name: "group_code", required: true, help: "Grup tarif/paket", example: "SIM-RESP-2" },
      { name: "amount", required: true, help: "Nilai klaim (rupiah, bilangan bulat > 0)", example: "5200000" },
      { name: "status", required: true, help: "draft, submitted, paid, pending, atau returned", example: "submitted" },
      { name: "submitted_at", required: "kondisional", help: "Wajib bila status bukan draft", example: "2026-09-08T10:00" },
      { name: "paid_at", required: "kondisional", help: "Wajib bila status paid", example: "" },
    ],
    notes: [
      "Episode dicocokkan dengan peserta + faskes + waktu masuk. Bila sudah ada, klaim ditautkan ke episode itu.",
      "Peserta baru dibuat sebagai pseudonim tanpa data pribadi dan tanpa masa penjaminan (pemeriksaan kepesertaan ditandai 'data belum cukup').",
      "Impor tidak memutuskan apa pun. Setelah diterapkan, mesin sinyal dan pemilahan pending dijalankan ulang; hasilnya tetap sinyal untuk ditinjau.",
    ],
  },
  layanan: {
    label: "Rincian layanan klaim",
    format: "csv",
    order: 2,
    description: "Satu baris = satu layanan pada klaim yang SUDAH ada (impor episode dan klaim lebih dulu).",
    dedupe: "claim_no + service_code + performed_at.",
    columns: [
      { name: "claim_no", required: true, help: "Nomor klaim yang sudah ada", example: "KLM-IMP-0001" },
      { name: "service_code", required: true, help: "Kode layanan (katalog simulasi: KMR, KON, LAB-DL, RONTGEN, BRONKO, ...)", example: "RONTGEN" },
      { name: "service_name", required: "kondisional", help: "Wajib bila kode tidak ada di katalog", example: "" },
      { name: "performed_at", required: true, help: D, example: "2026-09-01T12:00" },
      { name: "performer", required: true, help: "Nama pelaksana", example: "dr. Contoh" },
      { name: "qty", required: false, help: "Jumlah (bawaan 1)", example: "1" },
      { name: "amount", required: true, help: "Nilai baris (rupiah, ≥ 0)", example: "250000" },
    ],
    notes: ["Bukti pelaksanaan tidak diimpor di sini. Dokumen bukti diunggah lewat halaman Dokumen bukti."],
  },
  status_bayar: {
    label: "Status pembayaran",
    format: "csv",
    order: 3,
    description: "Satu baris = satu peristiwa status bayar dari sumber (BPJS/mitra). Sumber peristiwa dicatat sebagai 'impor'.",
    dedupe: "claim_no + event_type + event_at.",
    columns: [
      { name: "claim_no", required: true, help: "Nomor klaim yang sudah ada", example: "KLM-IMP-0001" },
      { name: "event_type", required: true, help: "submitted, complete (berkas lengkap/diterima), due (jatuh tempo menurut sumber), paid, pending, returned", example: "complete" },
      { name: "event_at", required: true, help: D, example: "2026-09-10T09:00" },
      { name: "amount", required: false, help: "Nilai peristiwa (rupiah)", example: "" },
      { name: "reason", required: false, help: "Kode alasan untuk pending/returned (BERKAS_KURANG, KODING_TIDAK_SELARAS, DATA_KEPESERTAAN, DATA_TIDAK_SELARAS, PERLU_PENDALAMAN)", example: "" },
    ],
    notes: [
      "Tanggal 'complete' diperlukan agar dasbor dapat menilai ketepatan bayar. Tanpa itu hasilnya 'data belum cukup'.",
      "Status klaim mengikuti peristiwa terbaru dari sumber (bukan keputusan SEHATI).",
    ],
  },
  standar: {
    label: "Standar dan indikator (JSON)",
    format: "json",
    order: 4,
    description: "Berkas JSON versi standar sesuai skema registry (sama dengan impor di halaman Registry standar). Hasilnya selalu versi DRAFT.",
    dedupe: "standard_id + version. Versi yang sama tidak dibuat dua kali.",
    columns: [],
    notes: ["Peninjauan dan persetujuan tetap lewat alur registry (draft → ditinjau → disetujui)."],
  },
};

export function templateFor(kind: ImportKind): string {
  const def = KIND_DEFS[kind];
  if (def.format === "json") {
    return JSON.stringify(
      {
        standard_id: "STD-CONTOH", name: "Standar contoh (ganti sesuai sumber)", version: "0.1", scope: ["rawat_jalan"],
        indicators: [{
          indicator_id: "CONTOH_ALUR", title: "Contoh: petugas menjelaskan alur pelayanan", kind: "communication", stage: "intra", scope: ["rawat_jalan"],
          required_slots: ["flow_explained"], slots: [{ id: "flow_explained", label: "Alur pelayanan dijelaskan", values: ["yes", "no"] }],
          observable_by_patient: true, source_id: null, locator: null,
          questions: [{ id: "CONTOH_ALUR_V1", slot: "flow_explained", text: "Apakah petugas menjelaskan alur pelayanan yang akan Anda jalani?" }],
        }],
      },
      null,
      2,
    ) + "\n";
  }
  const header = def.columns.map((c) => c.name);
  const row = def.columns.map((c) => c.example);
  const row2 =
    kind === "episode_klaim"
      ? ["KLM-IMP-0002", "RSNM", "PSN-IMP002", "RJTL", "2026-09-02T09:00", "2026-09-02T11:00", "J45", "Asma", "SIM-RESP-1", "650000", "draft", "", ""]
      : kind === "layanan"
        ? ["KLM-IMP-0001", "KON", "", "2026-09-01T10:30", "dr. Contoh", "1", "150000"]
        : ["KLM-IMP-0001", "paid", "2026-09-25T10:00", "5200000", ""];
  return toCsv([header, row, row2]);
}
