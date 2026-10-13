"use client";

import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useRef } from "react";
import { AiModeBadge, StatusPill } from "@/components/ui";
import { PROOF_LABEL } from "@/lib/labels";
import { WRAP } from "./data";
import css from "./landing.module.css";

/* Alur empat langkah. Desktop: garis terisi mengikuti gulir (scaleX). HP: rel geser snap-x, kartu 82vw dengan kartu berikutnya mengintip. */

const STEPS = [
  { name: "Sinyal", line: "Ada yang tidak cocok.", body: "Aturan menandai selisih. Belum kesimpulan.", status: "signal" },
  { name: "Klarifikasi", line: "Faskes menjelaskan.", body: "Diminta menjawab dengan bukti. Hak jawab lebih dulu.", status: "awaiting_clarification" },
  { name: "Keputusan", line: "Petugas menilai.", body: "Reviewer menyetujui. AI hanya menyiapkan bahan.", status: "verified" },
  { name: "Perbaikan", line: "Lalu diukur ulang.", body: "Tindakan dicatat, lalu dipantau sampai tuntas.", status: null },
] as const;

function Pill({ s }: { s: (typeof STEPS)[number]["status"] }) {
  return s ? <StatusPill tone={PROOF_LABEL[s].tone}>{PROOF_LABEL[s].label}</StatusPill> : <StatusPill tone="info">Tindakan perbaikan</StatusPill>;
}

function Node({ p, i }: { p: MotionValue<number>; i: number }) {
  const at = i / 4 + 0.02;
  const bg = useTransform(p, [Math.max(0, at - 0.04), at], [0, 1]);
  return (
    <span className="relative grid h-11 w-11 place-items-center rounded-full bg-card text-body-sm font-semibold tabular-nums text-ink shadow-e2 ring-1 ring-line">
      <motion.span style={{ opacity: bg }} className="absolute inset-0 rounded-full bg-brand" />
      <motion.span aria-hidden style={{ opacity: bg }} className="absolute inset-0 grid place-items-center text-white">
        {i + 1}
      </motion.span>
      <span>{i + 1}</span>
    </span>
  );
}

export function FlowRail({ live }: { live: boolean }) {
  const ref = useRef<HTMLOListElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start 85%", "end 45%"] });
  const fill = useTransform(p, [0, 1], [0, 1]);

  return (
    <section id="alur" aria-labelledby="alur-judul" className="bg-paper pb-24 md:pb-40">
      <div className={WRAP}>
        <h2 id="alur-judul" className="max-w-[16ch] text-balance text-title-1 font-semibold tracking-[-0.035em] md:text-headline">
          Dari sinyal sampai perbaikan.
        </h2>
        <p className="mt-4 max-w-[30rem] text-body-lg text-ink-soft">Setiap langkah punya pemilik, tenggat, dan jejak audit.</p>

        {/* Desktop */}
        <ol ref={ref} className="relative mt-20 hidden grid-cols-4 gap-10 md:grid">
          <span aria-hidden className="absolute left-[1.375rem] right-0 top-[1.375rem] h-0.5 rounded-full bg-line" />
          <motion.span aria-hidden style={{ scaleX: reduce ? 1 : fill }} className="absolute left-[1.375rem] right-0 top-[1.375rem] h-0.5 origin-left rounded-full bg-brand" />
          {STEPS.map((s, i) => (
            <li key={s.name} className="relative">
              {reduce ? (
                <span className="grid h-11 w-11 place-items-center rounded-full bg-brand text-body-sm font-semibold text-white">{i + 1}</span>
              ) : (
                <Node p={p} i={i} />
              )}
              <p className="mt-8 text-body-sm font-medium text-muted">{s.name}</p>
              <h3 className="mt-1 text-title-2 font-semibold tracking-tight">{s.line}</h3>
              <p className="mt-3 max-w-[16rem] text-body text-ink-soft">{s.body}</p>
              <div className="mt-5">
                <Pill s={s.status} />
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* HP: rel geser */}
      <ol className={`mt-10 flex gap-3 overflow-x-auto px-4 pb-4 sm:px-6 md:hidden ${css.rail}`} aria-label="Empat langkah">
        {STEPS.map((s, i) => (
          <li key={s.name} className="w-[82vw] max-w-[22rem] shrink-0 snap-start rounded-panel bg-card p-6 shadow-e2 ring-1 ring-line">
            <div className="flex items-center justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand text-body-sm font-semibold text-white">{i + 1}</span>
              <span className="text-body-sm text-muted">{i + 1} dari 4</span>
            </div>
            <p className="mt-8 text-body-sm font-medium text-muted">{s.name}</p>
            <h3 className="mt-1 text-title-2 font-semibold tracking-tight">{s.line}</h3>
            <p className="mt-3 text-body text-ink-soft">{s.body}</p>
            <div className="mt-6">
              <Pill s={s.status} />
            </div>
          </li>
        ))}
        <li aria-hidden className="w-1 shrink-0" />
      </ol>

      <div className={WRAP}>
        <div className="mt-12 flex flex-col gap-3 rounded-panel bg-card p-5 shadow-e1 sm:flex-row sm:items-center md:mt-20 md:p-6">
          <AiModeBadge mode={live ? "live" : "simulated"} />
          <p className="text-body text-ink-soft">AI memilih pertanyaan dari bank yang sudah ditinjau dan merangkum jawaban. AI tidak memutuskan.</p>
        </div>
      </div>
    </section>
  );
}
