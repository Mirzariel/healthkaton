/* Jenis butir ringkasan kasus. Dipisah dari case-summary.ts agar komponen klien dapat mengimpornya tanpa membawa kode server. */
export const SUMMARY_KINDS = ["participant_fact", "supporting", "contradicting", "missing", "suggestion"] as const;
export type SummaryKind = (typeof SUMMARY_KINDS)[number];
export const SUMMARY_KIND_LABEL: Record<SummaryKind, string> = {
  participant_fact: "Fakta dari peserta",
  supporting: "Dokumen/bukti yang mendukung",
  contradicting: "Kontradiksi",
  missing: "Informasi yang belum ada",
  suggestion: "Saran langkah",
};
