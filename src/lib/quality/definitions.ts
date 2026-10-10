import type Database from "better-sqlite3";

/* Definisi metrik mutu yang berversi (master prompt §10).
   Semua berstatus DRAFT sampai divalidasi pemilik proses (dr. Yuli). Angka dasbor selalu menyebut definisi dan denominatornya. */

/** PARAMETER DEMO. Jumlah jawaban sah minimum agar sebuah rasio dibaca sebagai analisis agregat. Laporan individual tetap ditindaklanjuti berapa pun jumlahnya. */
export const MIN_VALID_RESPONSES = 15;
export const PARAM_LABEL = "Parameter demo, belum divalidasi.";

/** Slot opsional kepuasan 0-10. Instrumen internal; BUKAN Indikator Nasional Mutu dan tidak pernah masuk skor indikasi (aturan I4). */
export const SATISFACTION_SLOT = "satisfaction_score";

/** Pemisah tegas: nilai ini tidak pernah masuk pembilang maupun penyebut gap (aturan I3). */
export const META_ANSWERS = ["unknown", "not_understood"] as const;

/** Aturan polaritas per indikator: jawaban mana yang berarti layanan standar BELUM diterima ("negatif") dan mana yang sudah ("positif").
    Slot utama dipilih per indikator; `requires` membatasi item pada peserta yang memang menjalani layanan prasyaratnya. */
export interface GapRule {
  indicator_id: string;
  slot: string;
  negative: string[];
  positive: string[];
  /** Kalimat polaritas untuk tampilan: apa yang dihitung sebagai "belum terpenuhi". */
  meaning: string;
  requires?: { slot: string; values: string[]; na_values: string[] };
}

const YN = (indicator_id: string, slot: string, meaning: string, inverted = false, requires?: GapRule["requires"]): GapRule => ({
  indicator_id, slot, negative: [inverted ? "yes" : "no"], positive: [inverted ? "no" : "yes"], meaning, requires,
});

export const GAP_RULES: GapRule[] = [
  YN("PRE_ID_CHECK", "membership_checked", "Kepesertaan tidak diperiksa saat mendaftar"),
  YN("PRE_FLOW_INFO", "flow_explained", "Alur pelayanan tidak dijelaskan"),
  YN("PRE_FEE", "fee_requested", "Diminta biaya untuk layanan yang seharusnya ditanggung", true),
  YN("INTRA_DOCTOR_VISIT", "doctor_visit", "Dokter tidak datang memeriksa"),
  YN("INTRA_LAB", "lab_result_explained", "Hasil laboratorium tidak disampaikan", false, { slot: "lab_done", values: ["yes"], na_values: ["no"] }),
  YN("INTRA_RX_EXPLAIN", "prescription_explained", "Cara pakai obat pada resep tidak dijelaskan dokter"),
  { indicator_id: "MED_FULFILLMENT", slot: "medication_receipt", negative: ["partial", "none"], positive: ["full"], meaning: "Obat untuk dibawa pulang diterima sebagian atau tidak diterima" },
  YN("MED_EXPLAIN", "medication_instructions_explained", "Aturan minum obat tidak dijelaskan saat penyerahan"),
  YN("POST_FOLLOWUP_INFO", "followup_info_given", "Jadwal kontrol/tindak lanjut tidak diberitahukan"),
  YN("POST_DISCHARGE_FEE", "discharge_fee_requested", "Diminta biaya tambahan saat pulang", true),
  YN("POST_OPEN_ISSUE", "open_issue", "Masih ada kendala yang belum selesai", true),
  YN("TRJ_IDENTITY", "identity_checked", "Identitas tidak dicocokkan sebelum pemeriksaan"),
  YN("TRJ_VITALS", "vitals_measured", "Tanda vital tidak diukur"),
  YN("TRJ_LAB_RESULT", "lab_result_handed", "Hasil laboratorium tidak diserahkan"),
  YN("TRJ_PHARM_INFO", "pharmacy_info_given", "Cara pakai obat tidak dijelaskan di farmasi"),
  YN("TRJ_NO_EXTRA_FEE", "extra_fee_requested", "Diminta biaya tambahan di luar ketentuan", true),
];
export const gapRuleOf = (indicatorId: string) => GAP_RULES.find((r) => r.indicator_id === indicatorId) ?? null;

/** Indikator yang sengaja tidak punya gap: prasyarat konteks, dan konfirmasi terarah (dibaca sebagai konfirmasi keberadaan layanan, bukan gap mutu). */
export const NON_GAP_INDICATORS = ["CTX_PROBES", "DIRECTED_SERVICE"];

export interface MetricDefinition {
  id: string;
  metric: string;
  version: string;
  definition: string;
  numerator: string;
  denominator: string;
  note: string;
}

const NOTE = "Draft. Menunggu validasi dr. Yuli / pemilik proses. Tidak sama dengan Indikator Nasional Mutu resmi.";

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    id: "MD-GAP-LAPORAN@v1", metric: "gap_laporan", version: "v1",
    definition: "Gap laporan: bagian peserta yang melaporkan layanan standar belum diterima pada satu indikator. Satuan hitung: satu sesi survei rutin yang bukan sandbox, satu jawaban per item. Polaritas jawaban per indikator ada pada tabel aturan.",
    numerator: "Jawaban negatif pada item yang berlaku (mis. obat diterima sebagian/tidak diterima)",
    denominator: "Jawaban sah (negatif + positif) pada item yang sama. Tidak tahu, tidak paham, tidak berlaku, tidak ditanya, dan tidak merespons dilaporkan terpisah dan tidak masuk pembilang maupun penyebut.",
    note: NOTE + ` Rasio dengan jawaban sah kurang dari ${MIN_VALID_RESPONSES} ditandai "data belum cukup" (${PARAM_LABEL})`,
  },
  {
    id: "MD-CAKUPAN@v1", metric: "cakupan_respons", version: "v1",
    definition: "Cakupan respons per indikator: seberapa banyak sesi yang memenuhi syarat benar-benar menghasilkan jawaban yang dapat dibaca.",
    numerator: "Sesi dengan jawaban terisi (sah atau tidak tahu/tidak paham) pada item",
    denominator: "Sesi yang memenuhi syarat dan berlaku, tidak termasuk yang tidak berlaku dan yang masih berjalan",
    note: NOTE,
  },
  {
    id: "MD-TERBUKTI@v1", metric: "proporsi_terbukti", version: "v1",
    definition: "Proporsi temuan yang terbukti di antara temuan yang pembuktiannya sudah berstatus akhir. Dihitung terpisah dari gap laporan dan tidak menyiratkan sebab; temuan yang belum selesai ditampilkan sendiri.",
    numerator: "Temuan berstatus Terbukti (disetujui reviewer)",
    denominator: "Temuan berstatus akhir: Terbukti + Tidak terbukti + Tidak dapat dibuktikan",
    note: NOTE,
  },
  {
    id: "MD-WAKTU@v1", metric: "waktu_penyelesaian", version: "v1",
    definition: "Median dan persentil ke-90 dalam hari kalender (pecahan) untuk: kasus dibuka hingga tinjauan pertama; klarifikasi dikirim hingga dijawab faskes; tindakan dibuat hingga selesai dikerjakan; tindakan dibuat hingga ditutup.",
    numerator: "Selisih waktu kejadian awal dan akhir pada setiap objek yang sudah mencapai kejadian akhir",
    denominator: "Objek yang sudah mencapai kejadian akhir. Yang belum selesai ditampilkan sebagai jumlah berjalan, tidak diperkirakan.",
    note: NOTE,
  },
  {
    id: "MD-KONFIRMASI@v1", metric: "konfirmasi_peserta", version: "v1",
    definition: "Hasil konfirmasi peserta setelah tindakan perbaikan: kendala selesai atau masih ada.",
    numerator: "Tindak lanjut konfirmasi peserta berhasil: selesai / masih ada kendala",
    denominator: "Tindak lanjut konfirmasi peserta yang sudah dijawab. Yang belum dijawab dilaporkan sebagai menunggu.",
    note: NOTE,
  },
  {
    id: "MD-SEBELUMSESUDAH@v1", metric: "sebelum_sesudah_intervensi", version: "v1",
    definition: "Perbandingan gap laporan pada indikator dan faskes yang sama: jendela 90 hari sebelum tindakan dibuat dan jendela setelah tindakan selesai dikerjakan, beserta interval ketidakpastian dan faskes pembanding sepeer.",
    numerator: "Sama dengan gap laporan",
    denominator: "Sama dengan gap laporan, per jendela",
    note: NOTE + " Perubahan agregat tidak otomatis membuktikan bahwa tindakan menjadi sebabnya: tanpa kelompok kontrol acak, tren dan faktor lain tidak dapat dikesampingkan.",
  },
  {
    id: "MD-TERARAH@v1", metric: "konfirmasi_terarah", version: "v1",
    definition: "Konfirmasi layanan terarah: bagian peserta yang menyatakan menjalani, tidak menjalani, atau tidak ingat suatu tindakan tertentu. Dipisahkan dari survei rutin karena distribusi masalahnya berbeda.",
    numerator: "Jawaban ya / tidak / tidak ingat per tindakan yang dikonfirmasi",
    denominator: "Undangan terarah yang dikirim; tidak merespons dilaporkan terpisah. Jawaban 'tidak ingat' bukan jawaban 'tidak'.",
    note: NOTE,
  },
  {
    id: "MD-KEPUASAN@v1", metric: "kepuasan_opsional", version: "v1",
    definition: "Skor kepuasan 0-10, instrumen internal opsional. Terpisah dari keberadaan layanan dan dari indikasi klaim; tidak boleh disebut Indikator Nasional Mutu tanpa mengikuti instrumen, formula, dan sampling resmi.",
    numerator: "Jumlah skor 0-10 yang sah",
    denominator: "Jumlah jawaban skor yang sah. Di luar 0-10, tidak tahu, atau tidak menjawab: dikeluarkan dan dilaporkan.",
    note: NOTE,
  },
];

export function seedMetricDefinitions(db: Database.Database) {
  const ins = db.prepare("INSERT OR IGNORE INTO metric_definitions (id, metric, version, definition, numerator, denominator, status, note) VALUES (?,?,?,?,?,?,'draft',?)");
  for (const m of METRIC_DEFINITIONS) ins.run(m.id, m.metric, m.version, m.definition, m.numerator, m.denominator, m.note);
}
