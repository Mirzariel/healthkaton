/* Foto editorial beranda. Sumber: Unsplash (Unsplash License, bebas dipakai tanpa biaya), dimuat dari CDN Unsplash.
   Dipakai hemat: suasana dan bobot, bukan hiasan. Hero dimuat segera dengan prioritas tinggi;
   dua foto pendukung dimuat saat mendekati viewport. CDN menyediakan ukuran responsif. */

export const PHOTOS = {
  hands: { id: "1584515933487-779824d29309", alt: "Dua tangan saling menggenggam di samping tempat tidur pasien" },
  ward: { id: "1538108149393-fbbd81895907", alt: "Bangsal rawat inap yang sunyi dengan tempat tidur tertata rapi" },
  consult: { id: "1666214280557-f1b5022eb634", alt: "Dokter menjelaskan hasil pemeriksaan di layar kepada pasien" },
} as const;

export type PhotoKey = keyof typeof PHOTOS;

const url = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=72&w=${w}`;

export function Photo({ k, className = "", sizes = "100vw", priority = false, decorative = false }: { k: PhotoKey; className?: string; sizes?: string; priority?: boolean; decorative?: boolean }) {
  const p = PHOTOS[k];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url(p.id, 1600)}
      srcSet={[640, 1080, 1600, 2400].map((w) => `${url(p.id, w)} ${w}w`).join(", ")}
      sizes={sizes}
      alt={decorative ? "" : p.alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "low"}
      decoding="async"
      className={`block h-full w-full object-cover ${className}`}
    />
  );
}
