export type Answer = "sesuai" | "tidak_sesuai" | "tidak_ingat";

/** Teks jawaban dalam bahasa sehari-hari (nilai dikirim ke API tetap sesuai/tidak_sesuai/tidak_ingat). */
export const ANSWERS: { value: Answer; label: string; spoken: string }[] = [
  { value: "sesuai", label: "YA, saya menjalani", spoken: "Ya, saya menjalani" },
  { value: "tidak_sesuai", label: "TIDAK pernah", spoken: "Tidak pernah" },
  { value: "tidak_ingat", label: "Saya lupa / tidak yakin", spoken: "Saya lupa atau tidak yakin" },
];

export const ANSWER_LABEL: Record<Answer, string> = {
  sesuai: "YA, saya menjalani",
  tidak_sesuai: "TIDAK pernah",
  tidak_ingat: "Saya lupa / tidak yakin",
};

interface Phrase {
  /** Nama sederhana, dipakai di tengah kalimat. */
  title: string;
  /** Satu kalimat penjelasan dalam kata sehari-hari. */
  desc: string;
}

const PHRASES: Record<string, Phrase> = {
  "LAB-DL": { title: "periksa darah", desc: "Darah diambil sedikit dari lengan untuk diperiksa di laboratorium." },
  INFUS: { title: "pemasangan infus", desc: "Cairan dialirkan lewat selang kecil di tangan." },
  RONTGEN: { title: "foto rontgen dada", desc: "Foto dada memakai mesin." },
  NEBU: { title: "uap obat (nebulizer)", desc: "Uap obat dihirup lewat masker." },
  USG: { title: "USG perut", desc: "Pemeriksaan perut dengan alat getar yang ditempelkan di kulit." },
  EKG: { title: "rekam jantung (EKG)", desc: "Detak jantung direkam dengan kabel kecil di dada." },
  ECHO: { title: "USG jantung", desc: "Pemeriksaan jantung dengan alat getar yang ditempelkan di dada." },
  "CT-SCAN": { title: "CT scan kepala", desc: "Foto kepala dengan mesin besar berbentuk lingkaran." },
  BRONKO: { title: "Bronkoskopi", desc: "Pemeriksaan saluran napas memakai selang kecil lewat hidung atau mulut." },
  ENDO: { title: "Endoskopi", desc: "Pemeriksaan lambung atau usus memakai selang kecil berkamera." },
  "OP-APP": { title: "operasi usus buntu", desc: "Operasi untuk mengangkat usus buntu." },
  "OP-FIX": { title: "operasi pemasangan pen tulang", desc: "Operasi memasang penyangga pada tulang yang patah." },
  HEMODIA: { title: "cuci darah", desc: "Darah dibersihkan dengan mesin, biasanya untuk penyakit ginjal." },
};

export function phraseFor(code: string, name: string): Phrase {
  return PHRASES[code] ?? { title: name.toLowerCase(), desc: "" };
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
