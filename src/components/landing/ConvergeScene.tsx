"use client";

import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from "framer-motion";
import { useRef, useState } from "react";
import { IconFile, IconHospital, IconUser } from "@/components/icons";
import { EASE_OUT } from "@/lib/motionTokens";
import { STATEMENTS, WRAP, sourceCards, type TheaterData } from "./data";
import css from "./landing.module.css";

/* Adegan "menyatu".
   Desktop (lg+): panggung di-pin selama ~300vh. Pernyataan besar berganti per langkah; tiga kartu sumber
   berukuran asli menyala bergantian, lalu bertumpuk menjadi satu dan selisihnya muncul.
   HP/tablet: kartu menumpuk dengan position: sticky (kedalaman bawaan peramban, tanpa pin).
   Kurangi gerak: susunan statis. */

const ICONS = [IconFile, IconHospital, IconUser];
type Card = ReturnType<typeof sourceCards>[number];

/* dim: kartu yang sedang tidak disorot menjadi kaca gelap (bukan putih pudar), teksnya warna malam yang lembut. */
function SourceCard({ c, i, dim = false }: { c: Card; i: number; dim?: boolean }) {
  const Icon = ICONS[i];
  const fade = "transition-[background-color,color,box-shadow] duration-500 ease-out-expo";
  return (
    <div
      className={`flex h-full min-h-[15.5rem] flex-col rounded-panel p-6 ring-1 ${fade} ${dim ? "bg-white/[0.04] text-on-night ring-white/10" : `bg-card text-ink shadow-e3 ${c.warn ? "ring-warn/30" : "ring-line"}`}`}
    >
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-control ${fade} ${dim ? "bg-white/8 text-on-night-soft" : c.warn ? "bg-warn-soft text-warn" : "bg-brand-tint text-brand"}`}>
          <Icon size={20} />
        </span>
        <div>
          <p className="text-body-sm font-semibold">{c.head}</p>
          <p className={`text-caption ${dim ? "text-on-night-soft" : "text-muted"}`}>{c.origin}</p>
        </div>
      </div>
      <p className="mt-6 text-title-3 font-semibold leading-snug">{c.value}</p>
      <p className={`mt-2 text-body-sm tabular-nums ${dim ? "text-on-night-soft" : c.warn ? "text-warn" : "text-ink-soft"}`}>{c.note}</p>
      {c.code && <p className={`mt-auto pt-5 font-mono text-caption ${dim ? "text-on-night-soft" : "text-muted"}`}>{c.code}</p>}
    </div>
  );
}

function Result({ d }: { d: TheaterData }) {
  return (
    <div className="rounded-panel bg-brand p-6 text-white shadow-e4">
      <p className="text-body-sm font-medium text-mint">Selisih terlihat</p>
      <p className="mt-2 text-title-2 font-semibold leading-snug tracking-tight">
        {d.documented ? "Ketiganya cocok. Tidak ada yang perlu diluruskan." : "Ditagih, tetapi catatannya belum ditemukan."}
      </p>
      <p className="mt-2 text-body text-white/80">{d.documented ? "Episode ditutup tanpa sinyal." : "Ini sinyal, bukan tuduhan. Faskes menjelaskan lebih dulu."}</p>
    </div>
  );
}

/* ---------- Desktop: panggung yang di-pin ---------- */

/* Langkah diskrit dari kemajuan gulir: 0–2 menyalakan satu sumber, 3 menumpuk ketiganya dan memunculkan selisihnya.
   Pergantian dianimasikan per langkah (bukan mengikuti gulir), jadi dua judul tidak pernah bertumpuk. */
const STEP_T = { duration: 0.5, ease: EASE_OUT };
const SLOT = 328; // lebar kartu (19rem = 304px) + jarak 24px.

function StageCard({ i, c, step }: { i: number; c: Card; step: number }) {
  const merged = step === 3;
  const active = merged || step === i;
  // Saat menyatu, ketiganya bertumpuk di slot pertama seperti kipas; kartu tengah di atas.
  const target = merged
    ? { x: -i * SLOT + i * 18, y: i === 1 ? -6 : 10, rotate: (i - 1) * 4, scale: i === 1 ? 1 : 0.92 }
    : { x: 0, y: 0, rotate: 0, scale: active ? 1.02 : 1 };
  return (
    <motion.li animate={target} transition={{ duration: 0.7, ease: EASE_OUT }} style={{ zIndex: merged ? (i === 1 ? 3 : 2 - i) : active ? 2 : 1 }} className="relative w-[19rem] shrink-0 will-change-transform">
      <SourceCard c={c} i={i} dim={!active} />
    </motion.li>
  );
}

function Pinned({ d }: { d: TheaterData }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [step, setStep] = useState(0);
  useMotionValueEvent(p, "change", (v) => setStep(Math.min(3, Math.max(0, Math.floor(v * 4.2)))));
  const cards = sourceCards(d);
  return (
    <div ref={ref} className="relative h-[320vh]">
      {/* Isi dipusatkan pada ruang di bawah nav (pt-20 = tinggi pil + jarak). */}
      <div className="sticky top-0 flex h-svh flex-col justify-center overflow-clip pb-8 pt-20">
        <div className={WRAP}>
          <h2 id="cara-judul" className="text-body-sm font-medium text-mint">Cara kerja</h2>
          <div className="relative mt-4 h-[2.1em] text-headline">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={step}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0, transition: STEP_T }}
                exit={{ opacity: 0, y: -20, transition: { duration: 0.22, ease: EASE_OUT } }}
                className={`absolute inset-x-0 top-0 max-w-[22ch] text-balance font-semibold leading-[1.04] tracking-[-0.035em] ${step === 3 ? "text-mint" : "text-white"}`}
              >
                {STATEMENTS[step]}
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="relative mt-12 flex items-center">
            <ol className="flex gap-6" aria-label="Tiga sumber">
              {cards.map((c, i) => (
                <StageCard key={c.key} i={i} c={c} step={step} />
              ))}
            </ol>
            {/* Selisih muncul di samping tumpukan, sejajar tengahnya. */}
            <AnimatePresence>
              {step === 3 && (
                <motion.div
                  initial={{ opacity: 0, x: 32 }}
                  animate={{ opacity: 1, x: 0, transition: { duration: 0.7, ease: EASE_OUT, delay: 0.25 } }}
                  exit={{ opacity: 0, x: 16, transition: { duration: 0.25 } }}
                  className="absolute left-[23rem] z-10 w-[34rem]"
                >
                  <Result d={d} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <ol aria-hidden className="mt-14 flex gap-2">
            {STATEMENTS.map((t, i) => (
              <li key={t} className={`h-1 rounded-full transition-all duration-500 ease-out-expo ${i === step ? "w-10 bg-mint" : i < step ? "w-4 bg-white/40" : "w-4 bg-white/12"}`} />
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

/* ---------- Statis (kurangi gerak) ---------- */

function Static({ d }: { d: TheaterData }) {
  const cards = sourceCards(d);
  return (
    <div className={`${WRAP} py-28`}>
      <h2 id="cara-judul" className="text-body-sm font-medium text-mint">Cara kerja</h2>
      <p className="mt-4 max-w-3xl text-balance text-headline font-semibold tracking-[-0.035em] text-white">Tiga catatan, disandingkan.</p>
      <ol className="mt-12 grid grid-cols-3 gap-6">
        {cards.map((c, i) => (
          <li key={c.key}>
            <SourceCard c={c} i={i} />
          </li>
        ))}
      </ol>
      <div className="mx-auto mt-8 max-w-[34rem]">
        <Result d={d} />
      </div>
    </div>
  );
}

/* ---------- HP/tablet: kartu menumpuk ---------- */

function Stacked({ d }: { d: TheaterData }) {
  const cards = sourceCards(d);
  return (
    <div className={`${WRAP} pb-24 pt-20`}>
      <h2 id="cara-judul-m" className="text-body-sm font-medium text-mint">Cara kerja</h2>
      <p className="mt-3 max-w-[18ch] text-balance text-title-1 font-semibold tracking-[-0.03em] text-white">Tiga catatan untuk satu perawatan.</p>
      <ol className="mt-10">
        {cards.map((c, i) => (
          <li key={c.key} className="sticky mb-[10vh] last:mb-0" style={{ top: `calc(5.5rem + ${i * 0.75}rem)` }}>
            <div className="rounded-panel bg-night-2 p-2 shadow-e4 ring-1 ring-inset ring-white/10">
              <p className="px-4 pb-4 pt-4 text-title-3 font-semibold text-white">{STATEMENTS[i]}</p>
              <SourceCard c={c} i={i} />
            </div>
          </li>
        ))}
        <li className="sticky" style={{ top: `calc(5.5rem + ${3 * 0.75}rem)` }}>
          <div className="rounded-panel bg-night-2 p-2 shadow-e4 ring-1 ring-inset ring-white/10">
            <p className="px-4 pb-4 pt-4 text-title-3 font-semibold text-mint">{STATEMENTS[3]}</p>
            <Result d={d} />
          </div>
        </li>
      </ol>
    </div>
  );
}

export function ConvergeScene({ d }: { d: TheaterData }) {
  const reduce = useReducedMotion();
  return (
    <section id="cara-kerja" aria-labelledby="cara-judul" className={`relative scroll-mt-0 bg-night text-on-night ${css.grain}`}>
      <div aria-hidden className={`pointer-events-none absolute inset-0 ${css.glow}`} />
      <div className="relative hidden lg:block">{reduce ? <Static d={d} /> : <Pinned d={d} />}</div>
      <div className="relative lg:hidden" aria-labelledby="cara-judul-m">
        <Stacked d={d} />
      </div>
    </section>
  );
}
