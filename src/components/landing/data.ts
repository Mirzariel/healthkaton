/* Data beranda yang dapat diserialisasi: dikirim dari page.tsx (server) ke adegan klien. */
import type { ProofStatus } from "@/lib/labels";

/** Cuplikan episode demo E-0001 (Bu Sari). Sama dengan data di konsol, portal faskes, dan aplikasi peserta. */
export interface TheaterData {
  findingId: string;
  caseId: string;
  title: string;
  proof: ProofStatus;
  priority: number;
  assignee: string | null;
  facility: string;
  diagnosis: string | null;
  stay: string | null;
  claimNo: string | null;
  service: string | null;
  amount: string | null;
  documented: boolean;
  lay: string | null;
  when: string | null;
  auditCount: number;
}

/** Sumber media yang benar-benar tersedia (dicek di server). */
export interface MediaSet {
  sources: { src: string; media?: string }[];
  poster?: string;
  posterMobile?: string;
  fallback: string;
  alt: string;
}

/** Tiga sumber yang disandingkan, diambil dari episode demo. */
export function sourceCards(d: TheaterData) {
  return [
    {
      key: "tagih",
      head: "Yang ditagih",
      origin: "Klaim",
      value: d.service ?? "Layanan pada klaim",
      note: d.amount ?? "",
      code: d.claimNo,
      warn: false,
    },
    {
      key: "catat",
      head: "Yang dicatat",
      origin: "Catatan faskes",
      value: d.documented ? "Catatan pelaksanaan ditemukan" : "Catatan pelaksanaan belum ditemukan",
      note: d.documented ? "Tertaut ke rekam medis" : "Bisa jadi hanya belum tertaut",
      code: null,
      warn: !d.documented,
    },
    {
      key: "terima",
      head: "Yang diterima",
      origin: "Peserta",
      value: d.lay ? `“Apakah Anda menjalani ${d.lay}${d.when ? ` pada ${d.when}` : ""}?”` : "Ditanya langsung",
      note: "Satu pertanyaan. Ragu itu wajar.",
      code: null,
      warn: false,
    },
  ] as const;
}

export const STATEMENTS = [
  "Klaim mencatat yang ditagih.",
  "Faskes mencatat yang dikerjakan.",
  "Hanya pasien yang tahu yang diterima.",
  "SEHATI menyandingkannya.",
] as const;

/** Prinsip yang ditegakkan sistem. Tiga pertama tampil besar, sisanya di balik "Lihat semua prinsip". */
export const PRINCIPLES = [
  { title: "Tanpa sanksi otomatis.", body: "Tidak ada pembayaran, koreksi klaim, atau sanksi yang berjalan sendiri." },
  { title: "Sinyal, bukan kesimpulan.", body: "Tanda awal disebut sinyal. Bahasa dijaga netral." },
  { title: "Ragu tidak dicurigai.", body: "Jawaban “tidak tahu”, “tidak paham”, atau tidak menjawab tidak menambah kecurigaan." },
  { title: "Penyebab dibahas belakangan.", body: "Penyebab baru dibicarakan setelah masalah terbukti dan faskes sempat menjawab." },
  { title: "Kepuasan bukan indikasi.", body: "Kepuasan peserta tidak pernah menjadi dasar indikasi." },
  { title: "Semua tercatat.", body: "Setiap perubahan tercatat di jejak audit berantai hash." },
] as const;

export const DOORS = [
  { href: "/m", who: "Peserta", title: "Aplikasi peserta", body: "Mulai dari pertanyaan Bu Sari." },
  { href: "/faskes", who: "Faskes", title: "Portal faskes", body: "Jawab klarifikasi dengan bukti." },
  { href: "/console", who: "Petugas", title: "Konsol petugas", body: "Periksa sinyal, lalu putuskan." },
] as const;

export const WRAP = "mx-auto w-full max-w-[80rem] px-4 sm:px-6 md:px-10";
