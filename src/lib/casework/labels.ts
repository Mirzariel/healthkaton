import type { ClaimReviewOption } from "../cases/core";
import type { Capability } from "../auth/principal";

/* Label tambahan modul kasus-faskes. Semua teks lolos pemeriksaan istilah netral (tests/casework.test.ts memeriksanya). */

export type Tone = "muted" | "info" | "warn" | "ok" | "danger";

export const SOURCE_LABEL: Record<string, { label: string; hint: string }> = {
  claim_engine: { label: "Episode dan klaim", hint: "Sinyal dari pencocokan episode, klaim, dan catatan pelaksanaan." },
  documentation: { label: "Dokumentasi", hint: "Catatan pelaksanaan layanan belum ditemukan pada pencocokan dokumen." },
  survey_routine: { label: "Survei rutin", hint: "Jawaban peserta pada survei pra, intra, atau pascapelayanan." },
  survey_directed: { label: "Konfirmasi terarah", hint: "Jawaban peserta pada konfirmasi terarah atas suatu layanan." },
  participant_report: { label: "Laporan peserta", hint: "Peserta melaporkan sendiri kendala layanan." },
  pending: { label: "Pending klaim", hint: "Berasal dari pemilahan klaim yang tertunda." },
};

export const CLARIFICATION_LABEL: Record<string, { label: string; tone: Tone; hint: string }> = {
  sent: { label: "Menunggu jawaban faskes", tone: "warn", hint: "Hak jawab faskes berjalan." },
  answered: { label: "Dijawab", tone: "ok", hint: "Faskes sudah menjawab." },
  lapsed: { label: "Lewat tenggat", tone: "muted", hint: "Tenggat lewat. Hak jawab terpenuhi, tetapi ini tidak membuktikan apa pun. Faskes masih dapat menjawab." },
  withdrawn: { label: "Ditarik", tone: "muted", hint: "Permintaan ditarik petugas." },
};

export const DISPUTE_LABEL: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Menunggu tanggapan", tone: "warn" },
  accepted: { label: "Diterima", tone: "ok" },
  rejected: { label: "Tidak diterima", tone: "muted" },
  noted: { label: "Dicatat", tone: "info" },
};

export const DIRECTION_LABEL: Record<string, { label: string; tone: Tone }> = {
  supports: { label: "Mendukung temuan", tone: "info" },
  contradicts: { label: "Bertentangan dengan temuan", tone: "ok" },
  neutral: { label: "Netral", tone: "muted" },
};

export const SEARCH_RESULT_LABEL: Record<string, string> = { found: "Ditemukan", not_found: "Tidak ditemukan", inconsistent: "Ditemukan, tetapi tidak selaras" };

export const FOLLOWUP_LABEL: Record<string, string> = {
  participant_confirmation: "Konfirmasi peserta",
  remeasure: "Pengukuran ulang",
  review: "Tinjauan",
};

export const OUTCOME_LABEL: Record<string, string> = { verified: "Terbukti", not_verified: "Tidak terbukti", inconclusive: "Tidak dapat dibuktikan" };

export const CLAIM_REVIEW_LABEL: Record<ClaimReviewOption, { label: string; hint: string }> = {
  loloskan: { label: "Loloskan", hint: "Catat bahwa klaim dapat dilanjutkan." },
  koreksi_nilai: { label: "Koreksi nilai", hint: "Catat usulan koreksi nilai klaim." },
  tolak: { label: "Tolak", hint: "Catat usulan menolak klaim." },
  eskalasi_audit: { label: "Eskalasi ke audit", hint: "Catat bahwa klaim dirujuk ke pemeriksaan lanjutan oleh pihak berwenang." },
};

export const SUGGESTION_KIND_LABEL: Record<string, { label: string; hint: string }> = {
  clarification_request: { label: "Permintaan klarifikasi ke faskes", hint: "Draf kalimat; petugas yang mengirim." },
  evidence_search: { label: "Cari bukti", hint: "Sumber yang layak diperiksa. Hasil pencarian dicatat petugas." },
  participant_confirmation: { label: "Konfirmasi terarah ke peserta", hint: "Pertanyaan lanjutan tentang kejadian, bukan penilaian." },
  record_gap: { label: "Lengkapi catatan", hint: "Informasi yang belum ada pada berkas kasus." },
};

export const SUGGESTION_STATE_LABEL: Record<string, { label: string; tone: Tone }> = {
  proposed: { label: "Menunggu peninjauan", tone: "warn" },
  accepted: { label: "Diterima", tone: "ok" },
  modified: { label: "Diterima dengan perubahan", tone: "info" },
  dismissed: { label: "Tidak dipakai", tone: "muted" },
  superseded: { label: "Digantikan ringkasan baru", tone: "muted" },
};

export const PRIORITY_LABEL: Record<number, { label: string; tone: Tone }> = {
  1: { label: "Tinggi", tone: "danger" },
  2: { label: "Sedang", tone: "warn" },
  3: { label: "Rendah", tone: "muted" },
};

/** Jenis kejadian pada linimasa kasus. */
export const TIMELINE_KIND_LABEL: Record<string, string> = {
  episode: "Perawatan",
  service: "Layanan",
  record: "Catatan pelaksanaan",
  claim: "Klaim",
  payment: "Status bayar",
  survey: "Peserta",
  case: "Kasus",
  proof: "Pembuktian",
  clarification: "Klarifikasi",
  evidence: "Bukti",
  decision: "Keputusan",
  action: "Tindakan",
  dispute: "Bantahan",
};

export const EDIT_CAP: Capability = "case.work";

/** Batas yang selalu tampil di dekat keluaran AI. */
export const ASSISTANT_LIMITS = [
  "Ringkasan ini draf. Petugas dapat mengoreksinya, dan setiap pernyataan tertaut ke sumbernya.",
  "Asisten tidak menentukan benar atau tidaknya temuan, penyebab, pembayaran, sanksi, resep, atau diagnosis.",
  "Dokumen yang belum ditemukan tidak berarti layanan tidak dilakukan. Jawaban peserta adalah sumber informasi, bukan putusan.",
  "Jawaban 'tidak ingat' atau 'tidak paham' bernilai nol: bukan bukti bahwa layanan ada atau tidak ada.",
];

/** Nama slot jawaban peserta dalam bahasa awam. */
export const SLOT_LABEL: Record<string, string> = {
  service_performed: "menjalani layanan", medication_receipt: "penerimaan obat untuk dibawa pulang", reported_reason: "alasan yang disampaikan petugas", outside_purchase: "membeli obat di luar",
  out_of_pocket_paid: "membayar sendiri", replacement_arranged: "obat pengganti disediakan faskes", directed_outside_purchase: "diarahkan membeli obat di luar", doctor_visit: "pertemuan dengan dokter",
  lab_done: "pemeriksaan laboratorium", fee_requested: "diminta biaya tambahan", fee_paid: "membayar biaya tambahan", extra_fee_requested: "diminta biaya tambahan", discharge_fee_requested: "diminta biaya saat pulang",
  discharge_fee_paid: "membayar biaya saat pulang", vitals_measured: "pengukuran tanda vital", open_issue: "kendala yang belum selesai", prescription_explained: "penjelasan resep", prescription_expected: "resep yang diharapkan",
  pharmacy_info_given: "informasi pengambilan obat", membership_checked: "pengecekan kepesertaan", medication_instructions_explained: "penjelasan cara minum obat", lab_result_handed: "penyerahan hasil laboratorium",
  lab_result_explained: "penjelasan hasil laboratorium", lab_performed: "pemeriksaan laboratorium", identity_checked: "pengecekan identitas", followup_info_given: "informasi kontrol lanjutan", flow_explained: "penjelasan alur layanan",
  doctor_introduced: "perkenalan dokter", discharge_prescription_expected: "obat pulang yang diharapkan", condition_plan_explained: "penjelasan kondisi dan rencana perawatan",
};
