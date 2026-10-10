/* Kamus label terpusat. Semua teks status yang tampil ke pengguna berasal dari sini.
   Prinsip bimbingan: bahasa netral. "Tidak tercatat" tidak berarti "tidak dikerjakan"; peserta bukan pihak yang dicurigai.
   Label bermuatan hukum hanya muncul setelah temuan terbukti dan disetujui reviewer (aturan I2). */

export type ProofStatus = "signal" | "under_review" | "awaiting_clarification" | "verified" | "not_verified" | "inconclusive";
export type ActionStatus = "open" | "in_progress" | "resolved" | "follow_up_pending" | "closed";
export type CaseLifecycle = "new" | "assigned" | "in_progress" | "closed" | "reopened";
export type FindingType = "T1" | "T2" | "T3" | "T4" | "T5";
export type Cause = "administrative" | "service_process" | "suspected_fraud";
export type SessionStatus = "scheduled" | "active" | "completed" | "partial" | "expired" | "cancelled";
export type Stage = "pre" | "intra" | "post" | "directed";

export const PROOF_LABEL: Record<ProofStatus, { label: string; tone: "muted" | "info" | "warn" | "ok" | "danger"; hint: string }> = {
  signal: { label: "Sinyal", tone: "muted", hint: "Ada tanda yang perlu diperiksa. Belum berarti ada masalah." },
  under_review: { label: "Sedang ditinjau", tone: "info", hint: "Petugas sedang mencari dan menilai bukti." },
  awaiting_clarification: { label: "Menunggu klarifikasi", tone: "warn", hint: "Faskes diminta menjawab; hak jawab faskes berjalan." },
  verified: { label: "Terbukti", tone: "ok", hint: "Disetujui reviewer. Analisis penyebab baru terbuka." },
  not_verified: { label: "Tidak terbukti", tone: "ok", hint: "Indikasi gugur. Dicatat untuk evaluasi aturan." },
  inconclusive: { label: "Tidak dapat dibuktikan", tone: "muted", hint: "Pencarian bukti sudah habis; ditutup tanpa penyebab." },
};

export const ACTION_LABEL: Record<ActionStatus, string> = {
  open: "Belum dikerjakan",
  in_progress: "Sedang dikerjakan",
  resolved: "Selesai dikerjakan",
  follow_up_pending: "Menunggu tindak lanjut",
  closed: "Ditutup",
};

export const LIFECYCLE_LABEL: Record<CaseLifecycle, string> = {
  new: "Baru",
  assigned: "Ditugaskan",
  in_progress: "Berjalan",
  closed: "Ditutup",
  reopened: "Dibuka ulang",
};

export const CAUSE_LABEL: Record<Cause, { label: string; hint: string }> = {
  administrative: { label: "Administratif", hint: "Layanan ada, pencatatan atau pemberkasan yang gagal." },
  service_process: { label: "Proses pelayanan", hint: "Ada gap antara standar pelayanan dan yang diterima peserta." },
  suspected_fraud: { label: "Dugaan fraud", hint: "Hanya setelah terbukti, hak jawab faskes terpenuhi, dan dua persetujuan berbeda peran. Bukan putusan." },
};

/** Nama temuan untuk tampilan. Tidak ada "fiktif", "phantom", atau "ganda" sebagai fakta. */
export const FINDING_LABEL: Record<FindingType, { label: string; short: string; hint: string }> = {
  T1: { label: "Dokumentasi pelaksanaan belum ditemukan", short: "Dokumentasi belum ditemukan", hint: "Layanan ditagih, tetapi catatan pelaksanaan belum ditemukan. Bisa berarti layanan tidak dilakukan, bisa pula pencatatannya gagal." },
  T2: { label: "Kandidat tagihan berulang", short: "Kandidat tagihan berulang", hint: "Dua klaim tampak mirip. Kemiripan belum tentu duplikasi." },
  T3: { label: "Kandidat perawatan lanjutan ditagih terpisah", short: "Kandidat perawatan lanjutan", hint: "Dua episode beruntun mungkin satu rangkaian perawatan. Perlu pembuktian." },
  T4: { label: "Layanan sesuai standar belum terlaksana (laporan/survei)", short: "Gap layanan dari laporan peserta", hint: "Peserta melaporkan layanan standar yang tidak diterima. Satu laporan dapat ditindaklanjuti; kesimpulan agregat butuh responden minimum." },
  T5: { label: "Temuan lain", short: "Lainnya", hint: "Diisi petugas dengan alasan." },
};

export const SESSION_LABEL: Record<SessionStatus, string> = {
  scheduled: "Terjadwal",
  active: "Berjalan",
  completed: "Selesai",
  partial: "Sebagian (belum tuntas)",
  expired: "Kedaluwarsa",
  cancelled: "Dibatalkan",
};

export const STAGE_LABEL: Record<Stage, string> = {
  pre: "Sebelum layanan (pra)",
  intra: "Selama layanan (intra)",
  post: "Setelah layanan (pasca)",
  directed: "Konfirmasi terarah",
};
export const STAGE_SHORT: Record<Stage, string> = { pre: "Pra", intra: "Intra", post: "Pasca", directed: "Terarah" };

export const AI_MODE_LABEL: Record<"live" | "simulated" | "fallback", { label: string; hint: string; tone: "ok" | "warn" | "muted" }> = {
  live: { label: "AI langsung", hint: "Model dipanggil melalui penyedia AI yang dikonfigurasi di server.", tone: "ok" },
  simulated: { label: "Simulasi", hint: "Penafsir deterministik berbasis aturan. BUKAN inferensi model AI.", tone: "muted" },
  fallback: { label: "Fallback", hint: "Pemanggilan AI gagal atau keluarannya ditolak validator; sistem memakai aturan deterministik.", tone: "warn" },
};

export const CARD_LABEL = {
  insufficient_data: "Data belum cukup",
  none: "Tanpa kartu",
  yellow: "Kuning: perlu pembinaan",
  red: "Merah: perlu review terjadwal",
} as const;

export const PENDING_LABEL = {
  doc_completeness: "Kelengkapan dokumen",
  coding: "Koding",
  data_mismatch: "Ketidaksesuaian data",
  needs_review: "Perlu pendalaman",
} as const;

export const DATA_SOURCE_LABEL = { simulated: "Simulasi", import: "Impor tervalidasi", live: "Langsung", unavailable: "Tidak tersedia" } as const;

export const ANSWER_LABEL: Record<string, string> = {
  yes: "Ya",
  no: "Tidak",
  unknown: "Tidak ingat / tidak yakin",
  not_understood: "Tidak paham",
  not_applicable: "Tidak berlaku",
  full: "Diterima semua",
  partial: "Sebagian",
  none: "Tidak diterima",
};

/** Istilah yang tidak boleh muncul sebagai fakta di UI atau di kalimat yang dibentuk AI (aturan I2). */
export const FORBIDDEN_TERMS = [
  "fiktif", "phantom", "saksi", "penipuan", "menipu", "bohong", "berbohong", "curang", "kecurangan", "korupsi", "pencuri", "maling", "rugikan bpjs", "terbukti salah",
];

export function findForbiddenTerms(text: string): string[] {
  const t = text.toLowerCase();
  return FORBIDDEN_TERMS.filter((w) => t.includes(w));
}

export const TONE_CLASS: Record<"muted" | "info" | "warn" | "ok" | "danger", string> = {
  muted: "bg-line text-ink-soft",
  info: "bg-info-soft text-info",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok",
  danger: "bg-danger-soft text-danger",
};
