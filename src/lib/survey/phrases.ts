import { fmtDate } from "../dates";

/* Bahasa awam untuk layanan pada konfirmasi terarah. Katalog layanan di demo ini simulasi; teks ini hanya membantu peserta mengenali tindakannya. */
export interface ServiceLay {
  lay: string;
  desc: string;
}
const LAY: Record<string, ServiceLay> = {
  BRONKO: { lay: "pemeriksaan saluran napas dengan selang kecil (bronkoskopi)", desc: "Selang kecil yang lentur dimasukkan lewat hidung atau mulut untuk melihat saluran napas. Biasanya dilakukan dengan pembiusan ringan." },
  ENDO: { lay: "pemeriksaan saluran cerna dengan selang kecil (endoskopi)", desc: "Selang kecil dimasukkan lewat mulut untuk melihat kerongkongan dan lambung." },
  "CT-SCAN": { lay: "pemindaian kepala dengan mesin CT scan", desc: "Anda berbaring di mesin berbentuk cincin besar sementara gambar kepala diambil." },
  ECHO: { lay: "USG jantung (ekokardiografi)", desc: "Alat diletakkan di dada untuk melihat gerak jantung lewat gambar." },
  USG: { lay: "USG perut", desc: "Alat berpelumas digerakkan di perut untuk melihat organ di dalamnya." },
  HEMODIA: { lay: "cuci darah (hemodialisis)", desc: "Darah dialirkan melalui mesin untuk disaring, biasanya beberapa jam." },
  "OP-APP": { lay: "operasi pengangkatan usus buntu", desc: "Tindakan bedah untuk mengangkat usus buntu." },
  "OP-FIX": { lay: "operasi pemasangan penyangga tulang", desc: "Tindakan bedah untuk menyatukan tulang yang patah dengan pen atau pelat." },
  RONTGEN: { lay: "foto rontgen dada", desc: "Foto dada memakai sinar-X, Anda diminta berdiri di depan alat." },
  EKG: { lay: "rekam jantung (EKG)", desc: "Kabel kecil ditempelkan di dada untuk merekam denyut jantung." },
  NEBU: { lay: "uap obat lewat masker (nebulisasi)", desc: "Obat dihirup sebagai uap lewat masker untuk melegakan napas." },
  "LAB-DL": { lay: "pemeriksaan darah", desc: "Darah diambil dari lengan untuk diperiksa di laboratorium." },
  INFUS: { lay: "pemasangan infus", desc: "Cairan dialirkan lewat selang kecil ke pembuluh darah di tangan." },
  KON: { lay: "konsultasi dengan dokter spesialis", desc: "Bertemu dokter spesialis untuk membahas kondisi Anda." },
};

export function serviceLay(code: string, fallbackName?: string | null): ServiceLay {
  return LAY[code] ?? { lay: (fallbackName ?? code).toLowerCase(), desc: "Tindakan sebagaimana tercantum pada rincian layanan." };
}

const PART = (h: number) => (h < 11 ? "pagi" : h < 15 ? "siang" : h < 18 ? "sore" : "malam");
/** "5 Mar 2026, sekitar pagi hari" — tanpa jam persis agar peserta mengingat dengan wajar. */
export function whenLabel(iso: string): string {
  const h = Number(iso.slice(11, 13));
  return `${fmtDate(iso)}, sekitar ${PART(Number.isFinite(h) ? h : 9)} hari`;
}

export interface DirectedSubject {
  service_id: string;
  service_code: string;
  service_lay: string;
  service_desc: string;
  when: string;
}

/** Isi penampung {service_lay}, {when}, {service_desc} pada teks pertanyaan. Tanpa subjek, penampung dibuang agar kalimat tetap terbaca. */
export function renderTemplate(text: string, subject: Partial<DirectedSubject> | null): string {
  const s = subject ?? {};
  return text
    .replace(/\{service_lay\}/g, s.service_lay ?? "tindakan ini")
    .replace(/\{when\}/g, s.when ?? "waktu perawatan")
    .replace(/\{service_desc\}/g, s.service_desc ?? "")
    .trim();
}
