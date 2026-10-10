import type { ConditionalRule, IndicatorKind, QuestionOption, Rule, SignalRule, SlotDef, StageKey } from "./types";
import { YES_NO_OPTIONS } from "./types";

/* BANK DRAFT SEHATI. Seluruh butir berstatus draft dan menunggu validasi dr. Yuli / pemilik proses.
   Tidak ada nomor pasal, target waktu, atau kewajiban yang diisi dari tebakan: bila sumber resmi belum ada,
   locator diisi null dan butir diberi catatan "menunggu validasi". */

export interface SourceSeed {
  id: string;
  kind: "internal" | "regulation" | "sop_local" | "article" | "website" | "placeholder";
  title: string;
  publisher: string | null;
  url: string | null;
  file_name: string | null;
  doc_date: string | null;
  accessed_at: string | null;
  version: string | null;
  locator_note: string | null;
  scope: string | null;
  relevance: string;
  validation_status: "awaiting_validation" | "validated" | "conflict" | "not_provided";
  validation_owner: string | null;
  notes: string | null;
}

const NOT_ACCESSED = "Tautan berasal dari master prompt; belum dibuka dan diverifikasi oleh pengembang. Tanggal akses sengaja dikosongkan.";

export const SOURCES: SourceSeed[] = [
  { id: "L1", kind: "internal", title: "Catatan Bimbingan SEHATI", publisher: "Tim SEHATI (catatan bimbingan dr. Yuli)", url: null, file_name: "Catatan Bimbingan SEHATI.docx", doc_date: null, accessed_at: "2026-10-10", version: null, locator_note: "Bagian 'Yang disampaikan dr. Yuli' dan 'Riset Big Hole'", scope: "Prinsip pembuktian, netralitas bahasa, survei tiga tahap, siklus perbaikan", relevance: "Dasar prinsip desain. Bukan standar pelayanan.", validation_status: "awaiting_validation", validation_owner: "dr. Yuli", notes: "Catatan pengusul atas arahan dr. Yuli; istilah VPK/AAK berasal dari riset awal pengusul, bukan dokumen resmi." },
  { id: "L2", kind: "internal", title: "Proposal SEHATI v2: Spesifikasi Sistem", publisher: "Tim SEHATI", url: null, file_name: "Proposal_SEHATI_v2_Spesifikasi_Sistem.docx", doc_date: "2026-10-08", accessed_at: "2026-10-10", version: "2.0 (draf)", locator_note: "Bagian 5.4 Bank pertanyaan awal; Bagian 9 Algoritma", scope: "Rancangan modul, entitas, aturan, seed", relevance: "Sumber draf bank pertanyaan (Q-PRE/INTRA/POST). Sebagian ketentuan digantikan master prompt 9 Okt 2026.", validation_status: "awaiting_validation", validation_owner: "dr. Yuli", notes: "Kolom SOP pada bank pertanyaan v2 berisi [SOP-ref] (belum diisi). Angka ambang v2 berstatus USULAN." },
  { id: "L3", kind: "sop_local", title: "Kumpulan SOP Puskesmas Traji (Pelayanan Pemeriksaan Umum, Laboratorium, Farmasi, Pendaftaran, Pengaduan, dll.)", publisher: "Puskesmas Traji, Kabupaten Temanggung", url: null, file_name: "PELAYANAN PEMERIKSAAN UMUM.pdf", doc_date: "2024-01-09", accessed_at: "2026-10-10", version: "Tanggal terbit 9 Januari 2024; Nomor Revisi kosong", locator_note: "Pemeriksaan Umum 4/01/2024 (hlm. 1-2); Laboratorium 4/16/2024 (hlm. 40); Farmasi 4/17/2024 (hlm. 42-43); Pendaftaran 4/18/2024 (hlm. 45); Pengaduan 4/23/2024 (hlm. 60-61) pada PDF 62 halaman", scope: "FKTP (puskesmas) tertentu. Contoh pemetaan lokal, BUKAN standar rumah sakit nasional", relevance: "Contoh pemetaan butir pengalaman peserta ke SOP lokal. Hanya berlaku pada cakupannya (puskesmas).", validation_status: "awaiting_validation", validation_owner: "dr. Yuli / pemilik SOP puskesmas", notes: "Kolom Nomor Revisi kosong pada dokumen. Jangan diterapkan ke rumah sakit." },
  { id: "L4", kind: "placeholder", title: "Rencana_Perbaikan_SEHATI_Fullstack.md", publisher: null, url: null, file_name: "Rencana_Perbaikan_SEHATI_Fullstack.md", doc_date: null, accessed_at: null, version: null, locator_note: null, scope: null, relevance: "Riwayat rencana; digantikan master prompt.", validation_status: "not_provided", validation_owner: null, notes: "Tidak dilampirkan ke pengembang. Isinya tidak dibaca dan tidak ditebak." },
  { id: "L5", kind: "placeholder", title: "Panduan_AI_Engine_SEHATI.md", publisher: null, url: null, file_name: "Panduan_AI_Engine_SEHATI.md", doc_date: null, accessed_at: null, version: null, locator_note: null, scope: null, relevance: "Penjelasan tambahan konsep ekstraksi/kandidat/evaluasi.", validation_status: "not_provided", validation_owner: null, notes: "Tidak dilampirkan ke pengembang. Isinya tidak dibaca dan tidak ditebak." },
  { id: "L6", kind: "placeholder", title: "Prompt_Vibe_Coding_SEHATI.md", publisher: null, url: null, file_name: "Prompt_Vibe_Coding_SEHATI.md", doc_date: null, accessed_at: null, version: null, locator_note: null, scope: null, relevance: "Prompt paket lama; digantikan master prompt.", validation_status: "not_provided", validation_owner: null, notes: "Tidak dilampirkan ke pengembang. Isinya tidak dibaca dan tidak ditebak." },
  { id: "E1", kind: "regulation", title: "Peraturan Menteri Kesehatan Nomor 30 Tahun 2022 (Indikator Nasional Mutu)", publisher: "Kementerian Kesehatan RI (JDIH)", url: "https://jdih.kemkes.go.id/documents/peraturan-menteri-kesehatan-nomor-30-tahun-2022", file_name: null, doc_date: null, accessed_at: null, version: null, locator_note: "Formula resmi ada di lampiran; belum dibaca", scope: "Indikator Nasional Mutu fasilitas kesehatan", relevance: "Dasar INM. Skor kepuasan internal SEHATI BUKAN INM resmi.", validation_status: "awaiting_validation", validation_owner: "dr. Yuli", notes: NOT_ACCESSED },
  { id: "E2", kind: "website", title: "Informasi indikator mutu Kemenkes (identifikasi pasien, komplain, kepuasan)", publisher: "Kementerian Kesehatan RI", url: "https://keslan.kemkes.go.id/inm/index/13500", file_name: null, doc_date: null, accessed_at: null, version: null, locator_note: null, scope: "Penjelasan indikator", relevance: "Tidak semua indikator dapat diukur lewat jawaban pasien.", validation_status: "awaiting_validation", validation_owner: "dr. Yuli", notes: NOT_ACCESSED },
  { id: "E3", kind: "regulation", title: "Peraturan Menteri Kesehatan Nomor 16 Tahun 2019 (pencegahan dan penanganan kecurangan JKN)", publisher: "Kementerian Kesehatan RI (JDIH)", url: "https://jdih.kemkes.go.id/documents/peraturan-menteri-kesehatan-nomor-16-tahun-2019", file_name: null, doc_date: null, accessed_at: null, version: null, locator_note: null, scope: "Kerangka pencegahan/penanganan fraud", relevance: "Bukan pembenaran menetapkan fraud dari survei.", validation_status: "awaiting_validation", validation_owner: "dr. Yuli", notes: NOT_ACCESSED },
  { id: "E4", kind: "article", title: "Ombudsman: potensi maladministrasi JKN, obat tidak tersedia pada faskes", publisher: "Ombudsman RI", url: "https://ombudsman.go.id/artikel/r/pwkinternal--potensi-maladministrasi-jkn-obat-tak-tersedia-padafaskes", file_name: null, doc_date: null, accessed_at: null, version: null, locator_note: null, scope: "Konteks Janji Layanan tentang pemenuhan obat", relevance: "Artikel penjelas, bukan SOP farmasi lengkap.", validation_status: "awaiting_validation", validation_owner: "dr. Yuli", notes: NOT_ACCESSED },
  { id: "E5", kind: "article", title: "Ombudsman: pembatasan hari rawat pasien JKN", publisher: "Ombudsman RI", url: "https://www.ombudsman.go.id/artikel/r/pwkinternal--pembatasan-hari-rawat-pasien-jkn", file_name: null, doc_date: null, accessed_at: null, version: null, locator_note: null, scope: "Konteks janji pelayanan rawat inap", relevance: "Lama rawat harus mempertimbangkan indikasi medis, bukan dianggap bermasalah dari jumlah hari.", validation_status: "awaiting_validation", validation_owner: "dr. Yuli", notes: NOT_ACCESSED },
  { id: "E6", kind: "website", title: "Panduan pelayanan Mobile JKN", publisher: "BPJS Kesehatan", url: "https://bpjs-kesehatan.go.id/user-manual-mobile-jkn/pelayanan%20jkn.html", file_name: null, doc_date: null, accessed_at: null, version: null, locator_note: null, scope: "Layanan Mobile JKN yang sudah ada", relevance: "Memahami batas diferensiasi SEHATI. Bukan dokumentasi API integrasi.", validation_status: "awaiting_validation", validation_owner: null, notes: NOT_ACCESSED },
  { id: "E7", kind: "article", title: "Penjelasan tarif JKN (INA-CBG / non-INA-CBG)", publisher: "Kementerian Kesehatan RI", url: "https://www.kemkes.go.id/id/ini-dia-standar-tarif-baru-pelayanan-jkn", file_name: null, doc_date: "2023-01-15", accessed_at: null, version: null, locator_note: null, scope: "Konsep tarif", relevance: "Referensi konseptual, bukan jaminan nominal tarif mutakhir pada semua tanggal episode.", validation_status: "awaiting_validation", validation_owner: null, notes: NOT_ACCESSED },
  { id: "E8", kind: "website", title: "Situs BPJS Kesehatan", publisher: "BPJS Kesehatan", url: "https://www.bpjs-kesehatan.go.id/", file_name: null, doc_date: null, accessed_at: null, version: null, locator_note: null, scope: "Kanal resmi informasi/pengaduan", relevance: "Bukan sumber seluruh SOP internal.", validation_status: "awaiting_validation", validation_owner: null, notes: NOT_ACCESSED },
  { id: "E9", kind: "website", title: "Situs resmi Healthkathon", publisher: "BPJS Kesehatan", url: "https://healthkathon.bpjs-kesehatan.go.id/", file_name: null, doc_date: null, accessed_at: null, version: null, locator_note: null, scope: "Tujuan/rubrik lomba", relevance: "Isi rubrik belum terverifikasi; gunakan guidebook resmi tim.", validation_status: "awaiting_validation", validation_owner: null, notes: NOT_ACCESSED },
  { id: "E10", kind: "article", title: "Publikasi Janji Layanan BPJS (Puskesmas Gerung, Lombok Barat)", publisher: "Dinas Kesehatan Lombok Barat", url: "https://puskesmasgerung-dikes.lombokbaratkab.go.id/berita/janji-layanan-bpjs/", file_name: null, doc_date: null, accessed_at: null, version: null, locator_note: null, scope: "Contoh publikasi lokal", relevance: "Pernah ditemukan lewat pencarian; akses ulang langsung gagal. Bukan satu-satunya dasar indikator.", validation_status: "awaiting_validation", validation_owner: null, notes: NOT_ACCESSED },
  { id: "P1", kind: "placeholder", title: "SOP rumah sakit yang berlaku (farmasi, komunikasi hasil, visit dokter, pendaftaran/pulang, penanganan komplain)", publisher: "Rumah sakit terkait / dr. Yuli", url: null, file_name: null, doc_date: null, accessed_at: null, version: null, locator_note: null, scope: "FKRTL", relevance: "Dibutuhkan untuk mengisi locator butir rumah sakit.", validation_status: "not_provided", validation_owner: "dr. Yuli / pemilik proses", notes: "Belum tersedia. Locator butir rumah sakit dikosongkan; jangan diisi dari tebakan." },
  { id: "P2", kind: "placeholder", title: "SE BPJS Kesehatan Nomor 1 Tahun 2024 (naskah resmi)", publisher: "BPJS Kesehatan", url: null, file_name: null, doc_date: null, accessed_at: null, version: null, locator_note: null, scope: null, relevance: "Hanya dipakai bila naskah resmi diperoleh.", validation_status: "not_provided", validation_owner: "dr. Yuli / pemilik proses", notes: "Naskah belum tersedia. Tidak ada isi yang dikutip." },
  { id: "P3", kind: "placeholder", title: "Definisi dan alur VPK (verifikasi pasca-klaim) dan AAK (audit administrasi klaim)", publisher: "BPJS Kesehatan", url: null, file_name: null, doc_date: null, accessed_at: null, version: null, locator_note: null, scope: null, relevance: "Posisi SEHATI terhadap VPK/AAK.", validation_status: "not_provided", validation_owner: "dr. Yuli / pemilik proses", notes: "Belum tersedia/terverifikasi." },
  { id: "P4", kind: "placeholder", title: "Ketentuan kerja sama faskes-BPJS yang relevan (termasuk tenggat pembayaran klaim)", publisher: "BPJS Kesehatan", url: null, file_name: null, doc_date: null, accessed_at: null, version: null, locator_note: null, scope: null, relevance: "Menentukan tanggal jatuh tempo pembayaran pada dasbor pembayaran.", validation_status: "not_provided", validation_owner: "dr. Yuli / pemilik proses", notes: "Belum tersedia. Dasbor pembayaran memakai kebijakan DEMO berlabel dan tidak menyatakan keterlambatan resmi." },
];

export const STANDARD_SEEDS = [
  { id: "STD-JANJI", name: "Bank indikator pengalaman layanan (Janji Layanan), rumah sakit", owner: "dr. Yuli (validasi) / tim SEHATI (draf)" },
  { id: "STD-TRAJI", name: "Contoh pemetaan SOP Puskesmas Traji (FKTP)", owner: "dr. Yuli (validasi) / tim SEHATI (draf)" },
];

export const STANDARD_VERSION_SEEDS = [
  { id: "STD-JANJI@draft-1", standard_id: "STD-JANJI", version: "draft-1", status: "draft" as const, scope: ["hospital"], sources: ["L1", "L2", "E4", "E5", "P1"], notes: "Draf tim. Butir rumah sakit menunggu SOP RS (P1) untuk locator. Dipakai demo dengan label; bukan dasar klaim kepatuhan resmi." },
  { id: "STD-TRAJI@draft-1", standard_id: "STD-TRAJI", version: "draft-1", status: "draft" as const, scope: ["puskesmas"], sources: ["L3"], notes: "Contoh pemetaan lokal. Hanya berlaku untuk puskesmas, tidak untuk rumah sakit." },
];

type Slotish = { id: string; label: string; values?: string[]; valueLabels?: Record<string, string> };
const bool = (id: string, label: string): Slotish => ({ id, label, values: ["yes", "no"] });
const slotDef = (s: Slotish): SlotDef => ({ id: s.id, label: s.label, values: s.values ?? ["yes", "no"], valueLabels: s.valueLabels });

export interface QuestionSeed {
  id: string;
  slot: string;
  text: string;
  core?: boolean;
  ord?: number;
  options?: QuestionOption[];
  helper?: string;
}
export interface IndicatorSeed {
  indicator_id: string;
  version?: string;
  standard: string;
  title: string;
  description?: string;
  kind: IndicatorKind;
  stage: StageKey;
  scope: string[];
  applicability?: Rule | null;
  required: string[];
  conditional?: ConditionalRule[];
  slots: Slotish[];
  signal?: SignalRule[];
  observable?: boolean;
  source: string | null;
  locator: string | null;
  questions: QuestionSeed[];
}

const MED_OPTIONS: QuestionOption[] = [
  { value: "full", label: "Ya, semua sudah saya terima" },
  { value: "partial", label: "Sebagian saja" },
  { value: "none", label: "Belum / tidak menerima obat" },
  { value: "unknown", label: "Saya lupa / tidak yakin" },
  { value: "not_understood", label: "Saya tidak paham pertanyaannya" },
];
const REASON_OPTIONS: QuestionOption[] = [
  { value: "stock_out", label: "Obat sedang kosong / stok habis" },
  { value: "not_covered", label: "Katanya obat tidak ditanggung" },
  { value: "no_reason_given", label: "Tidak ada alasan yang disampaikan" },
  { value: "other", label: "Alasan lain" },
  { value: "unknown", label: "Saya lupa / tidak yakin" },
  { value: "not_understood", label: "Saya tidak paham pertanyaannya" },
];
const YN_NA: QuestionOption[] = [...YES_NO_OPTIONS.slice(0, 2), { value: "not_applicable", label: "Tidak berlaku bagi saya" }, ...YES_NO_OPTIONS.slice(2)];

const HOSP = ["hospital"];
const L2 = "L2";

export const INDICATOR_SEEDS: IndicatorSeed[] = [
  // ---------- PRA ----------
  {
    indicator_id: "PRE_ID_CHECK", standard: "STD-JANJI@draft-1", title: "Pemeriksaan kepesertaan saat pendaftaran", kind: "administrative", stage: "pre", scope: HOSP,
    required: ["membership_checked"], slots: [bool("membership_checked", "Kartu/data kepesertaan diperiksa saat mendaftar")], source: L2, locator: "Bagian 5.4, Q-PRE-01 (kolom SOP belum diisi)",
    questions: [{ id: "PRE_ID_V1", slot: "membership_checked", text: "Saat mendaftar, apakah petugas memeriksa kartu atau data kepesertaan JKN Anda?", ord: 10 }],
  },
  {
    indicator_id: "PRE_FLOW_INFO", standard: "STD-JANJI@draft-1", title: "Penjelasan alur pelayanan", kind: "communication", stage: "pre", scope: HOSP,
    required: ["flow_explained"], slots: [bool("flow_explained", "Alur pelayanan dijelaskan")], source: L2, locator: "Bagian 5.4, Q-PRE-02 (kolom SOP belum diisi)",
    questions: [{ id: "PRE_FLOW_V1", slot: "flow_explained", text: "Apakah petugas menjelaskan alur pelayanan yang akan Anda jalani?", ord: 20 }],
  },
  {
    indicator_id: "PRE_FEE", standard: "STD-JANJI@draft-1", title: "Permintaan biaya di luar tanggungan saat pendaftaran", kind: "cost", stage: "pre", scope: HOSP,
    required: ["fee_requested"], conditional: [{ when: { slot: "fee_requested", operator: "eq", value: "yes" }, require: ["fee_paid"] }],
    slots: [bool("fee_requested", "Diminta membayar biaya untuk layanan yang seharusnya ditanggung JKN"), bool("fee_paid", "Biaya tersebut akhirnya dibayar")],
    signal: [{ when: { slot: "fee_paid", operator: "eq", value: "yes" }, category: "biaya", note: "Peserta melaporkan membayar biaya yang menurutnya seharusnya ditanggung." }],
    source: L2, locator: "Bagian 5.4, Q-PRE-03 (kolom SOP belum diisi)",
    questions: [
      { id: "PRE_FEE_V1", slot: "fee_requested", text: "Apakah Anda diminta membayar biaya untuk layanan yang seharusnya ditanggung JKN?", ord: 30, helper: "Biaya yang ditanggung JKN mengikuti ketentuan; bila ragu, pilih 'tidak yakin'." },
      { id: "PRE_FEE_PAID_V1", slot: "fee_paid", text: "Apakah biaya itu akhirnya Anda bayar?", core: false, ord: 31 },
    ],
  },
  // ---------- INTRA ----------
  {
    indicator_id: "INTRA_DOCTOR_VISIT", standard: "STD-JANJI@draft-1", title: "Dokter memeriksa dan berkomunikasi", kind: "existence", stage: "intra", scope: HOSP,
    required: ["doctor_visit"],
    conditional: [{ when: { slot: "doctor_visit", operator: "eq", value: "yes" }, require: ["doctor_introduced", "condition_plan_explained"] }],
    slots: [bool("doctor_visit", "Dokter datang memeriksa"), bool("doctor_introduced", "Dokter memperkenalkan diri"), bool("condition_plan_explained", "Kondisi dan rencana perawatan dijelaskan")],
    signal: [{ when: { slot: "doctor_visit", operator: "eq", value: "no" }, category: "visit_dokter", note: "Peserta melaporkan dokter tidak datang memeriksa." }],
    source: L2, locator: "Bagian 5.4, Q-INTRA-01/02 (kolom SOP belum diisi)",
    questions: [
      { id: "INTRA_VISIT_V1", slot: "doctor_visit", text: "Selama dirawat atau berobat, apakah dokter datang memeriksa Anda?", ord: 10 },
      { id: "INTRA_INTRO_V1", slot: "doctor_introduced", text: "Apakah dokter memperkenalkan diri kepada Anda?", core: false, ord: 11 },
      { id: "INTRA_PLAN_V1", slot: "condition_plan_explained", text: "Apakah dokter menjelaskan kondisi Anda dan rencana perawatannya?", core: false, ord: 12 },
    ],
  },
  {
    indicator_id: "INTRA_LAB", standard: "STD-JANJI@draft-1", title: "Pemeriksaan laboratorium dilakukan dan hasilnya disampaikan", kind: "communication", stage: "intra", scope: HOSP,
    applicability: { field: "lab_performed", operator: "eq", value: true }, required: ["lab_done"],
    conditional: [{ when: { slot: "lab_done", operator: "eq", value: "yes" }, require: ["lab_result_explained"] }],
    slots: [bool("lab_done", "Menjalani pemeriksaan darah/laboratorium"), bool("lab_result_explained", "Hasil pemeriksaan disampaikan dan dijelaskan")],
    source: L2, locator: "Bagian 5.4, Q-INTRA-03/04 (kolom SOP belum diisi)",
    questions: [
      { id: "INTRA_LAB_V1", slot: "lab_done", text: "Apakah Anda menjalani pemeriksaan darah atau laboratorium?", ord: 20, helper: "Misalnya diambil darah atau urine untuk diperiksa." },
      { id: "INTRA_LABRES_V1", slot: "lab_result_explained", text: "Apakah hasil pemeriksaan laboratorium itu disampaikan dan dijelaskan kepada Anda?", core: false, ord: 21 },
    ],
  },
  {
    indicator_id: "INTRA_RX_EXPLAIN", standard: "STD-JANJI@draft-1", title: "Penjelasan resep oleh dokter", kind: "communication", stage: "intra", scope: HOSP,
    applicability: { field: "prescription_expected", operator: "eq", value: true }, required: ["prescription_explained"],
    slots: [bool("prescription_explained", "Cara memakai obat pada resep dijelaskan dokter")], source: L2, locator: "Bagian 5.4, Q-INTRA-05 (kolom SOP belum diisi)",
    questions: [{ id: "INTRA_RX_V1", slot: "prescription_explained", text: "Apakah dokter menjelaskan cara memakai obat pada resep Anda?", ord: 30 }],
  },
  // ---------- PASCA ----------
  {
    indicator_id: "MED_FULFILLMENT", standard: "STD-JANJI@draft-1", title: "Pemenuhan obat untuk dibawa pulang", kind: "existence", stage: "post", scope: ["hospital", "inpatient_discharge"],
    description: "Contoh bank dari master prompt bagian 8.3. Menunggu validasi dr. Yuli dan SOP farmasi RS (P1).",
    applicability: { field: "discharge_prescription_expected", operator: "eq", value: true },
    required: ["medication_receipt"],
    conditional: [
      { when: { slot: "medication_receipt", operator: "in", values: ["partial", "none"] }, require: ["reported_reason", "replacement_arranged", "outside_purchase"] },
      { when: { slot: "outside_purchase", operator: "eq", value: "yes" }, require: ["out_of_pocket_paid"] },
    ],
    slots: [
      { id: "medication_receipt", label: "Penerimaan obat untuk dibawa pulang", values: ["full", "partial", "none"], valueLabels: { full: "Semua diterima", partial: "Sebagian", none: "Tidak diterima" } },
      { id: "reported_reason", label: "Alasan yang disampaikan petugas", values: ["stock_out", "not_covered", "no_reason_given", "other"], valueLabels: { stock_out: "Stok kosong", not_covered: "Dikatakan tidak ditanggung", no_reason_given: "Tidak ada alasan", other: "Alasan lain" } },
      bool("replacement_arranged", "Faskes membantu menyediakan obat pengganti"),
      bool("directed_outside_purchase", "Diarahkan petugas membeli obat di luar"),
      bool("outside_purchase", "Peserta benar-benar membeli obat di luar"),
      bool("out_of_pocket_paid", "Peserta membayar sendiri untuk obat tersebut"),
    ],
    signal: [{ when: { slot: "medication_receipt", operator: "in", values: ["partial", "none"] }, category: "obat", note: "Peserta melaporkan obat untuk dibawa pulang belum diterima seluruhnya." }],
    source: "E4", locator: "Artikel penjelas (bukan SOP farmasi); locator butir menunggu SOP RS (P1)",
    questions: [
      { id: "MED_RECEIPT_V1", slot: "medication_receipt", text: "Apakah obat untuk dibawa pulang sudah Anda terima?", ord: 10, options: MED_OPTIONS, helper: "Obat yang diresepkan dokter saat Anda pulang." },
      { id: "MED_REASON_V1", slot: "reported_reason", text: "Alasan apa yang disampaikan petugas?", core: false, ord: 11, options: REASON_OPTIONS },
      { id: "MED_REPLACEMENT_V1", slot: "replacement_arranged", text: "Apakah faskes membantu menyediakan obat penggantinya?", core: false, ord: 12 },
      { id: "MED_PURCHASE_V1", slot: "outside_purchase", text: "Apakah Anda akhirnya membeli obat tersebut di luar?", core: false, ord: 13 },
      { id: "MED_PAID_V1", slot: "out_of_pocket_paid", text: "Apakah Anda membayar sendiri untuk obat itu?", core: false, ord: 14 },
    ],
  },
  {
    indicator_id: "MED_EXPLAIN", standard: "STD-JANJI@draft-1", title: "Penjelasan aturan pakai obat saat penyerahan", kind: "communication", stage: "post", scope: HOSP,
    applicability: { field: "medication_receipt", operator: "in", values: ["full", "partial"] }, required: ["medication_instructions_explained"],
    slots: [bool("medication_instructions_explained", "Aturan minum obat dijelaskan saat penyerahan")], source: L2, locator: "Bagian 5.4, Q-POST-02 (kolom SOP belum diisi)",
    questions: [{ id: "MED_EXPLAIN_V1", slot: "medication_instructions_explained", text: "Saat obat diserahkan, apakah petugas menjelaskan aturan minumnya?", ord: 20 }],
  },
  {
    indicator_id: "POST_FOLLOWUP_INFO", standard: "STD-JANJI@draft-1", title: "Informasi jadwal kontrol atau tindak lanjut", kind: "communication", stage: "post", scope: HOSP,
    required: ["followup_info_given"], slots: [bool("followup_info_given", "Diberi tahu jadwal kontrol/tindak lanjut")], source: L2, locator: "Bagian 5.4, Q-POST-03 (kolom SOP belum diisi)",
    questions: [{ id: "POST_FU_V1", slot: "followup_info_given", text: "Apakah Anda diberi tahu jadwal kontrol atau tindak lanjut?", ord: 30, options: YN_NA }],
  },
  {
    indicator_id: "POST_DISCHARGE_FEE", standard: "STD-JANJI@draft-1", title: "Biaya tambahan saat pulang", kind: "cost", stage: "post", scope: HOSP,
    required: ["discharge_fee_requested"], conditional: [{ when: { slot: "discharge_fee_requested", operator: "eq", value: "yes" }, require: ["discharge_fee_paid"] }],
    slots: [bool("discharge_fee_requested", "Diminta biaya tambahan saat pulang"), bool("discharge_fee_paid", "Biaya tambahan itu dibayar")],
    signal: [{ when: { slot: "discharge_fee_paid", operator: "eq", value: "yes" }, category: "biaya", note: "Peserta melaporkan membayar biaya tambahan saat pulang." }],
    source: L2, locator: "Bagian 5.4, Q-POST-04 (kolom SOP belum diisi)",
    questions: [
      { id: "POST_FEE_V1", slot: "discharge_fee_requested", text: "Apakah Anda diminta biaya tambahan saat pulang?", ord: 40 },
      { id: "POST_FEE_PAID_V1", slot: "discharge_fee_paid", text: "Apakah biaya tambahan itu Anda bayar?", core: false, ord: 41 },
    ],
  },
  {
    indicator_id: "POST_OPEN_ISSUE", standard: "STD-JANJI@draft-1", title: "Kendala yang belum selesai", kind: "administrative", stage: "post", scope: HOSP,
    required: ["open_issue"], slots: [bool("open_issue", "Masih ada kendala dari layanan ini yang belum selesai")],
    signal: [{ when: { slot: "open_issue", operator: "eq", value: "yes" }, category: "kendala_belum_selesai", note: "Peserta menyatakan masih ada kendala yang belum selesai." }],
    source: null, locator: "Butir penutup SEHATI; tidak berasal dari standar tertentu",
    questions: [{ id: "POST_OPEN_V1", slot: "open_issue", text: "Apakah masih ada kendala dari layanan ini yang belum selesai?", ord: 50 }],
  },
  // ---------- PRASYARAT PENERAPAN (dipakai hanya bila konteks episode tidak diketahui) ----------
  {
    indicator_id: "CTX_PROBES", standard: "STD-JANJI@draft-1", title: "Klarifikasi konteks penerapan (prasyarat)", kind: "administrative", stage: "post", scope: [],
    description: "Bukan indikator pengukuran. Menampung pertanyaan klarifikasi untuk bidang konteks yang belum diketahui, agar layanan yang tidak berlaku tidak langsung dianggap tidak berlaku (dan sebaliknya).",
    required: [], slots: [bool("discharge_prescription_expected", "Ada resep obat untuk dibawa pulang"), bool("prescription_expected", "Ada resep obat"), bool("lab_performed", "Menjalani pemeriksaan laboratorium")],
    source: null, locator: "Internal SEHATI (prasyarat penerapan); bukan butir standar",
    questions: [
      { id: "CTX_RX_DISCHARGE_V1", slot: "discharge_prescription_expected", text: "Apakah dokter memberi Anda resep obat untuk dibawa pulang?", core: false, ord: 1 },
      { id: "CTX_RX_V1", slot: "prescription_expected", text: "Apakah dokter memberi Anda resep obat?", core: false, ord: 2 },
      { id: "CTX_LAB_V1", slot: "lab_performed", text: "Apakah Anda menjalani pemeriksaan darah atau laboratorium?", core: false, ord: 3 },
    ],
  },
  // ---------- TERARAH ----------
  {
    indicator_id: "DIRECTED_SERVICE", standard: "STD-JANJI@draft-1", title: "Konfirmasi terarah: satu tindakan dilakukan atau tidak", kind: "existence", stage: "directed", scope: [],
    required: ["service_performed"], slots: [{ id: "service_performed", label: "Tindakan dijalani", values: ["yes", "no"] }],
    source: "L1", locator: "Bimbingan: 'lihat dulu apakah layanan itu terbukti ada atau tidak'",
    questions: [{ id: "DIR_SERVICE_V1", slot: "service_performed", text: "Apakah Anda menjalani {service_lay} pada {when}?", ord: 10, options: YES_NO_OPTIONS, helper: "{service_desc}" }],
  },
  // ---------- CONTOH PEMETAAN SOP PUSKESMAS TRAJI (FKTP; hanya cakupan puskesmas) ----------
  {
    indicator_id: "TRJ_IDENTITY", standard: "STD-TRAJI@draft-1", title: "Pencocokan identitas dengan rekam medis sebelum pemeriksaan", kind: "administrative", stage: "intra", scope: ["puskesmas"],
    required: ["identity_checked"], slots: [bool("identity_checked", "Identitas dicocokkan sebelum diperiksa")], source: "L3", locator: "SOP Pemeriksaan Umum 4/01/2024, langkah 2 (hlm. 1)",
    questions: [{ id: "TRJ_ID_V1", slot: "identity_checked", text: "Sebelum diperiksa, apakah petugas mencocokkan identitas Anda?", ord: 10 }],
  },
  {
    indicator_id: "TRJ_VITALS", standard: "STD-TRAJI@draft-1", title: "Anamnesa dan pengukuran tanda vital", kind: "existence", stage: "intra", scope: ["puskesmas"],
    required: ["vitals_measured"], slots: [bool("vitals_measured", "Tanda vital diukur (tensi, suhu, dsb.)")], source: "L3", locator: "SOP Pemeriksaan Umum 4/01/2024, langkah 3 (hlm. 1)",
    questions: [{ id: "TRJ_VITALS_V1", slot: "vitals_measured", text: "Apakah petugas menanyakan keluhan Anda dan mengukur tensi atau suhu badan?", ord: 20, helper: "Tanda vital: tensi, suhu, nadi, napas." }],
  },
  {
    indicator_id: "TRJ_LAB_RESULT", standard: "STD-TRAJI@draft-1", title: "Hasil laboratorium diserahkan kepada pasien", kind: "communication", stage: "intra", scope: ["puskesmas"],
    applicability: { field: "lab_performed", operator: "eq", value: true }, required: ["lab_result_handed"], slots: [bool("lab_result_handed", "Hasil laboratorium diserahkan")],
    source: "L3", locator: "SOP Laboratorium 4/16/2024, langkah 13 (hlm. 40)",
    questions: [{ id: "TRJ_LAB_V1", slot: "lab_result_handed", text: "Apakah hasil pemeriksaan laboratorium diserahkan kepada Anda?", ord: 30 }],
  },
  {
    indicator_id: "TRJ_PHARM_INFO", standard: "STD-TRAJI@draft-1", title: "Informasi obat saat penyerahan di farmasi", kind: "communication", stage: "post", scope: ["puskesmas"],
    applicability: { field: "prescription_expected", operator: "eq", value: true }, required: ["pharmacy_info_given"],
    slots: [bool("pharmacy_info_given", "Cara pakai, aturan pakai, efek samping obat dijelaskan")], source: "L3", locator: "SOP Farmasi 4/17/2024, langkah 7 (hlm. 42-43)",
    questions: [{ id: "TRJ_PHARM_V1", slot: "pharmacy_info_given", text: "Saat menerima obat, apakah petugas apotek menjelaskan cara pakai dan aturan pakainya?", ord: 10 }],
  },
  {
    indicator_id: "TRJ_NO_EXTRA_FEE", standard: "STD-TRAJI@draft-1", title: "Tidak ada biaya tambahan atas pelayanan", kind: "cost", stage: "post", scope: ["puskesmas"],
    required: ["extra_fee_requested"], slots: [bool("extra_fee_requested", "Diminta biaya tambahan di luar ketentuan")],
    signal: [{ when: { slot: "extra_fee_requested", operator: "eq", value: "yes" }, category: "biaya", note: "Peserta melaporkan diminta biaya tambahan." }],
    source: "L3", locator: "SOP Laboratorium/Farmasi, butir 7 'Hal-hal yang perlu diperhatikan' (hlm. 40, 42). Catatan SOP mengatur pasien umum/non-BPJS; pemakaian untuk peserta JKN perlu validasi.",
    questions: [{ id: "TRJ_FEE_V1", slot: "extra_fee_requested", text: "Apakah Anda diminta membayar biaya tambahan atas pelayanan hari ini?", ord: 20 }],
  },
];

export const GLOSSARY_SEEDS: { term: string; plain: string }[] = [
  { term: "resep", plain: "Surat dari dokter yang berisi daftar obat yang perlu Anda terima." },
  { term: "obat pengganti", plain: "Obat lain dengan fungsi serupa yang diberikan bila obat yang diresepkan sedang kosong." },
  { term: "tanda vital", plain: "Pengukuran dasar tubuh: tekanan darah (tensi), suhu, denyut nadi, dan napas." },
  { term: "pemeriksaan laboratorium", plain: "Pemeriksaan contoh darah, urine, atau cairan tubuh lain di laboratorium." },
  { term: "bronkoskopi", plain: "Pemeriksaan saluran napas memakai selang kecil yang dimasukkan lewat hidung atau mulut." },
  { term: "kepesertaan JKN", plain: "Status Anda sebagai peserta program Jaminan Kesehatan Nasional, biasanya ditunjukkan dengan kartu atau aplikasi." },
  { term: "kontrol", plain: "Kunjungan ulang yang dijadwalkan dokter setelah Anda pulang." },
  { term: "pendamping", plain: "Keluarga atau orang yang Anda beri izin untuk menjawab atas nama Anda." },
];

export { slotDef };
