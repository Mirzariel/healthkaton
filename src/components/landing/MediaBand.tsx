"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { AmbientVideo } from "./AmbientVideo";
import { WRAP, type MediaSet } from "./data";
import css from "./landing.module.css";

/* Pita media dalam bingkai membulat (bukan full-bleed), dengan parallax ringan di dalam bingkai. */

export function MediaBand({ media }: { media: MediaSet }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(p, [0, 1], ["-7%", "7%"]);
  const frameScale = useTransform(p, [0, 0.4], [0.94, 1]);

  return (
    <section aria-labelledby="pita-judul" className="bg-paper pb-20 md:pb-28">
      <div className={WRAP}>
        <motion.div
          ref={ref}
          style={reduce ? undefined : { scale: frameScale }}
          className="relative isolate aspect-[4/5] overflow-hidden rounded-media bg-night shadow-e3 sm:aspect-[16/10] lg:aspect-[16/8]"
        >
          <motion.div style={reduce ? undefined : { y }} className="absolute -inset-y-[9%] inset-x-0">
            <AmbientVideo {...media} sizes="(min-width: 1280px) 1200px, 100vw" imgClassName="object-[50%_55%]" controlClassName="right-4 top-[13%] md:right-6" label="video pita" />
          </motion.div>
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-night/90 via-night/30 to-transparent" />
          <div aria-hidden className={`pointer-events-none absolute inset-0 ${css.grain}`} />
          <div className="absolute inset-x-0 bottom-0 p-6 md:p-12">
            <h2 id="pita-judul" className="max-w-[20ch] text-balance text-title-1 font-semibold tracking-[-0.03em] text-white md:text-headline">
              Satu laporan ditindaklanjuti. Banyak laporan menjadi peta mutu.
            </h2>
            <p className="mt-4 max-w-[28rem] text-body text-on-night md:text-body-lg">Dasbor mutu baru menyimpulkan setelah jumlah responden cukup.</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
