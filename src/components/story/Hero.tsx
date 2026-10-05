"use client";

import { motion, useScroll, useSpring } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Term } from "@/components/explain";
import { BTN_LINE_DARK, BTN_PRIMARY_DARK, Reveal } from "./parts";

/* ---------- Bilah atas: tipis, gaya Apple ---------- */

export function Header() {
  const { scrollYProgress } = useScroll();
  const bar = useSpring(scrollYProgress, { stiffness: 120, damping: 28 });
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-ink/95 text-white backdrop-blur-sm">
      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href="#atas" className="flex items-center gap-2" aria-label="SEHATI, kembali ke atas">
          <span className="h-3 w-3 rounded-[3px] bg-[#2fa58f]" aria-hidden />
          <span className="text-sm font-semibold tracking-[0.18em]">SEHATI</span>
        </a>
        <nav className="hidden items-center gap-8 text-xs text-white/70 md:flex" aria-label="Bagian halaman">
          <a href="#apa-itu" className="transition hover:text-white">Apa itu SEHATI</a>
          <a href="#panduan" className="transition hover:text-white">Panduan demo</a>
          <a href="#sari" className="transition hover:text-white">Cerita Bu Sari</a>
          <Link href="/m" className="transition hover:text-white">Sisi peserta</Link>
        </nav>
        <div className="flex shrink-0 items-center gap-4">
        <Link href="/m" className="text-xs text-white/75 transition hover:text-white md:hidden">Peserta</Link>
        <Link href="/console" className="shrink-0 rounded-full bg-white px-4 py-1.5 text-xs font-medium text-ink transition hover:bg-white/85">
          Konsol petugas
        </Link>
        </div>
      </div>
      <motion.div style={{ scaleX: bar }} className="absolute inset-x-0 bottom-0 h-px origin-left bg-white/70" aria-hidden />
    </header>
  );
}

/* ---------- Pembuka sinematik ---------- */

export function Hero() {
  return (
    <section id="atas" className="relative flex min-h-[calc(100svh-3rem)] items-center justify-center overflow-hidden bg-black px-4 text-white sm:px-6">
      <Image
        src="/images/hero-corridor.jpg"
        alt="Lorong rumah sakit yang terang dengan pintu terbuka di ujungnya (foto suasana)"
        fill
        preload
        sizes="100vw"
        className="object-cover opacity-50 grayscale"
        style={{ objectPosition: "center 55%" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-black" aria-hidden />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center py-24 text-center">
        <Reveal>
          <p className="eyebrow text-white/70">Healthkathon 2026 · Efisiensi Risiko pada Fasilitas Kesehatan</p>
        </Reveal>
        <Reveal delay={0.05}>
          <h1 className="mt-8 text-balance text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl lg:text-[6.5rem]">
            Satu perawatan.
            <br />
            <em>Tiga tagihan.</em>
          </h1>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="mx-auto mt-8 max-w-2xl text-balance text-lg leading-relaxed text-white/85 sm:text-xl">
            <strong className="font-semibold text-white">SEHATI</strong> menyatukan klaim rumah sakit ke satu <Term k="episode">episode</Term> pasien untuk mendeteksi <Term k="phantom">tagihan fiktif</Term>,{" "}
            <Term k="repeat_billing">ganda</Term>, dan <Term k="fragmentation">terpecah</Term>. Peserta jadi saksi, petugas melihat bukti.
          </p>
        </Reveal>
        <Reveal delay={0.18} className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a href="#panduan" className={BTN_PRIMARY_DARK}>
            Mulai demo
          </a>
          <Link href="/console" className={BTN_LINE_DARK}>
            Buka konsol
          </Link>
        </Reveal>
      </div>
      <a href="#apa-itu" aria-label="Gulir ke bawah" className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60 transition hover:text-white">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </a>
    </section>
  );
}
