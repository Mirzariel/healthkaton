"use client";

import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useRef } from "react";
import { IconCheck, IconChevronDown } from "@/components/icons";
import { PRINCIPLES, WRAP } from "./data";
import css from "./landing.module.css";

/* Prinsip. Kalimat utama terungkap kata demi kata mengikuti gulir; tiga prinsip besar; sisanya di balik disclosure. */

const HEAD = "AI menyarankan. Manusia memutuskan.".split(" ");

function Word({ p, i, n, w }: { p: MotionValue<number>; i: number; n: number; w: string }) {
  const opacity = useTransform(p, [i / n, (i + 1) / n], [0.18, 1]);
  return (
    <motion.span style={{ opacity }} className="inline-block">
      {w}&nbsp;
    </motion.span>
  );
}

export function Principles() {
  const ref = useRef<HTMLHeadingElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start 85%", "start 35%"] });
  const big = PRINCIPLES.slice(0, 3);

  return (
    <section id="prinsip" aria-labelledby="prinsip-judul" className={`scroll-mt-20 bg-night pb-4 pt-24 text-on-night md:pb-8 md:pt-36 ${css.grain}`}>
      <div className={WRAP}>
        <p className="text-body-sm font-medium text-mint">Prinsip yang ditegakkan sistem</p>
        <h2 id="prinsip-judul" ref={ref} className="mt-5 max-w-[14ch] text-balance text-headline font-semibold tracking-[-0.04em] text-white md:text-display">
          {reduce ? HEAD.join(" ") : HEAD.map((w, i) => <Word key={i} p={p} i={i} n={HEAD.length} w={w} />)}
        </h2>

        <ol className="mt-16 border-t border-white/10 md:mt-24">
          {big.map((x, i) => (
            <li key={x.title} className="grid gap-3 border-b border-white/10 py-8 md:grid-cols-[6rem_minmax(0,1fr)_minmax(0,24rem)] md:items-baseline md:gap-8 md:py-12">
              <span className="text-body-sm font-medium tabular-nums text-on-night-soft">0{i + 1}</span>
              <h3 className="text-title-1 font-semibold tracking-[-0.03em] text-white">{x.title}</h3>
              <p className="text-body-lg text-on-night-soft">{x.body}</p>
            </li>
          ))}
        </ol>

        <details className="group mt-8">
          <summary className={`inline-flex min-h-11 items-center gap-2 rounded-full px-1 text-body font-semibold text-white hover:text-mint ${css.summary}`}>
            Lihat semua prinsip
            <IconChevronDown size={18} className={css.chev} />
          </summary>
          <ul className="mt-6 grid gap-x-12 md:grid-cols-2">
            {PRINCIPLES.map((x) => (
              <li key={x.title} className="flex gap-4 border-t border-white/10 py-5">
                <IconCheck size={18} className="mt-1 shrink-0 text-mint" />
                <span className="text-body-lg text-on-night">
                  <span className="font-semibold text-white">{x.title}</span> {x.body}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
