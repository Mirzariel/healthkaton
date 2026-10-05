"use client";

import Link from "next/link";

const COL = "text-sm text-white/70 transition hover:text-white";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-ink px-4 pb-10 pt-16 text-white sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 md:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <p className="flex items-center gap-2.5">
              <span className="h-3.5 w-3.5 rounded-[3px] bg-[#2fa58f]" aria-hidden />
              <span className="text-[15px] font-semibold tracking-[0.16em]">SEHATI</span>
            </p>
            <p className="mt-4 max-w-sm text-base leading-relaxed text-white/70">Satu episode pasien, satu gambaran utuh. Peserta jadi saksi, petugas melihat bukti.</p>
          </div>
          <nav aria-label="Coba prototipe">
            <p className="eyebrow text-white/50">Prototipe</p>
            <ul className="mt-4 space-y-3">
              <li><Link href="/m" className={COL}>Sisi peserta</Link></li>
              <li><Link href="/console" className={COL}>Konsol petugas</Link></li>
              <li><Link href="/console/precheck" className={COL}>Pra-pengajuan klaim</Link></li>
            </ul>
          </nav>
          <nav aria-label="Di halaman ini">
            <p className="eyebrow text-white/50">Di halaman ini</p>
            <ul className="mt-4 space-y-3">
              <li><a href="#apa-itu" className={COL}>Apa itu SEHATI</a></li>
              <li><a href="#panduan" className={COL}>Panduan demo</a></li>
              <li><a href="#sari" className={COL}>Cerita Bu Sari</a></li>
              <li><a href="#batas" className={COL}>Batas klaim kami</a></li>
            </ul>
          </nav>
        </div>
        <div className="mt-14 border-t border-white/10 pt-6 text-xs leading-relaxed text-white/55">
          <p>Prototipe Healthkathon 2026. Seluruh nama dan angka adalah data contoh, bukan data peserta JKN. Bukan produk resmi BPJS Kesehatan.</p>
          <p className="mt-2 max-w-3xl">Foto: Unsplash. Dhiyo Nugraha (lorong), Nappy (tablet), Daniel Sone / National Cancer Institute (laptop). Hanya suasana.</p>
        </div>
      </div>
    </footer>
  );
}
