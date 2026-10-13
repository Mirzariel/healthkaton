"use client";

import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { AmbientVideo } from "./AmbientVideo";
import { WRAP, type MediaSet } from "./data";
import css from "./landing.module.css";

/* Hero 100svh. Saat digulir, media menyusut ke 0,92 dan sudutnya membulat seperti kartu yang terangkat;
   teks naik perlahan dan memudar. Semua gerak hanya transform/opacity. */

const LINES = [
  { t: "Yang ditagih.", dim: true },
  { t: "Yang dicatat.", dim: true },
  { t: "Yang diterima.", dim: false },
];

export function Hero({ media }: { media: MediaSet }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scale = useTransform(p, [0, 1], [1, 0.92]);
  const radius = useTransform(p, [0, 0.35], [0, 28]);
  const textY = useTransform(p, [0, 1], [0, -90]);
  const textO = useTransform(p, [0, 0.55], [1, 0]);

  return (
    <section ref={ref} aria-labelledby="judul-utama" className="relative h-svh min-h-[36rem] overflow-clip bg-night">
      <motion.div
        style={reduce ? undefined : { scale, borderRadius: radius }}
        className="absolute inset-0 overflow-hidden shadow-e4 will-change-transform"
      >
        <AmbientVideo {...media} priority sizes="100vw" imgClassName="object-[50%_45%]" controlClassName="bottom-5 right-4 md:bottom-8 md:right-8" />
        {/* Gelap di kiri-bawah agar teks terbaca; lembut, tanpa garis tegas. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,var(--color-night)_32%,rgb(11_23_20/0.88)_58%,rgb(11_23_20/0.25)_100%)] md:bg-[linear-gradient(to_right,rgb(11_23_20/0.95),rgb(11_23_20/0.55)_50%,transparent)]" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-night/80 to-transparent" />
        <div aria-hidden className={`pointer-events-none absolute inset-0 ${css.grain}`} />
      </motion.div>

      <motion.div style={reduce ? undefined : { y: textY, opacity: textO }} className={`${WRAP} pointer-events-none relative flex h-full flex-col justify-end pb-24 [&>*]:pointer-events-auto pt-28 md:justify-center md:pb-16`}>
        <h1 id="judul-utama" className="text-balance text-headline font-semibold leading-[1.02] tracking-[-0.04em] text-white md:text-display md:leading-[0.98]">
          {LINES.map((l, i) => (
            <span key={l.t} className={`block animate-rise-in ${l.dim ? "text-white/60 md:text-white/45" : "text-white"}`} style={{ animationDelay: `${120 + i * 140}ms` }}>
              {l.t}
            </span>
          ))}
        </h1>
        <p className="mt-5 max-w-[30rem] animate-rise-in text-body-lg text-on-night md:mt-8 md:text-lead" style={{ animationDelay: "560ms" }}>
          SEHATI menyandingkan ketiganya. Selisihnya terlihat, lalu diluruskan bersama.
        </p>
        <div className="mt-7 flex animate-rise-in flex-col gap-3 sm:flex-row sm:items-center md:mt-10" style={{ animationDelay: "700ms" }}>
          <a href="#cara-kerja" className="inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-body font-semibold text-night transition-colors hover:bg-white/90">
            Lihat caranya
          </a>
          <Link href="/console" className={`inline-flex h-12 items-center justify-center rounded-full px-6 text-body font-semibold text-white transition-colors hover:bg-white/10 ${css.glass}`}>
            Masuk konsol
          </Link>
        </div>
        <p className="mt-6 animate-rise-in text-caption text-on-night-soft" style={{ animationDelay: "820ms" }}>
          Data sintetis · bukan produk resmi BPJS Kesehatan.
        </p>
      </motion.div>
    </section>
  );
}
