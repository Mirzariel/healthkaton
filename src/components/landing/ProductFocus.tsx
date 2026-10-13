"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { Tag } from "@/components/casework/parts";
import { IconArrowLeft, IconHistory } from "@/components/icons";
import { ProofBadge } from "@/components/ui";
import { PRIORITY_LABEL } from "@/lib/casework/labels";
import { EASE_OUT } from "@/lib/motionTokens";
import { WRAP, sourceCards, type TheaterData } from "./data";
import css from "./landing.module.css";

/* Fokus produk: potongan layar konsol pada ukuran asli (1:1, teks 14–18px), bukan miniatur.
   Saat masuk layar, panel tegak dari kemiringan 8°; tiga catatan muncul bertahap; mock HP selebar 320px meluncur masuk. */

const CALLOUTS = ["Sinyal, bukan putusan.", "Tiga sumber, satu episode.", "Hak jawab lebih dulu."];

/* Anotasi bernomor. Desktop/tablet: pil kaca di ruang kosong baris judul tiap blok (tidak menutupi isi).
   HP: label kecil sebaris di atas blok yang dimaksud. */
function Callout({ n, className = "" }: { n: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      initial={reduce ? false : { opacity: 0, y: 8, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-15% 0px" }}
      transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.25 + n * 0.2 }}
      className={`hidden shrink-0 items-center gap-2 whitespace-nowrap rounded-full py-1 pl-1 pr-3 text-body-sm font-medium text-white sm:inline-flex ${css.glass} ${className}`}
    >
      <span className="grid h-6 w-6 place-items-center rounded-full bg-mint text-caption font-semibold text-night">{n + 1}</span>
      {CALLOUTS[n]}
    </motion.span>
  );
}

function CalloutInline({ n }: { n: number }) {
  return (
    <p aria-hidden className="mb-2 flex items-center gap-2 px-1 text-caption font-semibold text-brand sm:hidden">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-caption text-white">{n + 1}</span>
      {CALLOUTS[n]}
    </p>
  );
}

function Crop({ d }: { d: TheaterData }) {
  const pr = PRIORITY_LABEL[d.priority] ?? { label: "Sedang", tone: "warn" as const };
  const cards = sourceCards(d);
  return (
    <div className="overflow-hidden rounded-panel bg-paper text-ink ring-1 ring-black/5">
      <div className="flex h-11 items-center gap-4 border-b border-line bg-card px-5">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
        </span>
        <p className="truncate text-caption text-muted">
          Konsol petugas · Kasus <span className="font-mono">{d.caseId}</span>
        </p>
      </div>
      <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="min-w-0 space-y-4 max-sm:space-y-0 max-sm:[&>div]:mb-5 max-sm:[&>section]:mb-5">
          <CalloutInline n={0} />
          <div className="relative rounded-card bg-card p-5 shadow-e1">
            <div className="flex items-start justify-between gap-3">
              <p className="pt-1 font-mono text-caption text-muted">{d.findingId}</p>
              <Callout n={0} />
            </div>
            <h3 className="mt-1.5 text-title-2 font-semibold leading-snug tracking-tight">{d.title}</h3>
            <div className="relative mt-4 flex flex-wrap gap-2">
              <ProofBadge status={d.proof} />
              <Tag t={pr.tone === "danger" ? "warn" : pr.tone}>Prioritas {pr.label.toLowerCase()}</Tag>
            </div>
            <p className="mt-4 text-body-sm text-ink-soft">
              {d.facility}
              {d.diagnosis ? ` · ${d.diagnosis}` : ""}
            </p>
          </div>

          <CalloutInline n={1} />
          <section className="relative rounded-card bg-card shadow-e1">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
              <p className="text-body font-semibold">Klaim dan bukti pelaksanaan</p>
              <Callout n={1} />
            </div>
            <ul className="divide-y divide-line">
              {cards.map((c) => (
                <li key={c.key} className="grid gap-1 px-5 py-4 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-4">
                  <p className={`text-body-sm font-medium ${c.warn ? "text-warn" : "text-muted"}`}>{c.head}</p>
                  <div className="min-w-0">
                    <p className="text-body font-semibold leading-snug">{c.value}</p>
                    <p className="mt-0.5 text-body-sm tabular-nums text-ink-soft">{c.note}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mx-5 mb-5 rounded-control bg-brand-tint px-4 py-3 text-body-sm text-ink-soft">Dokumen yang belum ditemukan belum membuktikan layanan tidak dilakukan.</p>
          </section>

          <CalloutInline n={2} />
          <div className="relative flex flex-wrap items-center gap-3 rounded-card bg-card px-5 py-4 shadow-e1">
            <div className="mr-auto">
              <p className="text-body font-semibold">Klarifikasi ke faskes</p>
              <p className="text-body-sm text-muted">Tenggat 7 hari kerja</p>
            </div>
            <Callout n={2} />
            <span className="inline-flex h-10 items-center rounded-control bg-brand px-4 text-body-sm font-semibold text-white">Minta klarifikasi</span>
          </div>
        </div>

        <aside className="hidden space-y-4 lg:block">
          <div className="rounded-card bg-subtle p-5">
            <p className="text-body-sm font-semibold">Status kasus</p>
            <dl className="mt-4 space-y-4 text-body-sm">
              <div>
                <dt className="text-muted">Episode</dt>
                <dd className="mt-0.5">{d.stay ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Penanggung jawab</dt>
                <dd className="mt-0.5">{d.assignee ?? "Belum ditugaskan"}</dd>
              </div>
              {d.claimNo && (
                <div>
                  <dt className="text-muted">Nomor klaim</dt>
                  <dd className="mt-0.5 font-mono text-caption">{d.claimNo}</dd>
                </div>
              )}
            </dl>
          </div>
          <div className="rounded-card bg-subtle p-5 text-body-sm">
            <p className="font-semibold">Jejak audit</p>
            <p className="mt-2 flex items-center gap-1.5 text-ink-soft">
              <IconHistory size={16} />
              {d.auditCount.toLocaleString("id-ID")} entri
            </p>
            <p className="mt-3 text-muted">AI menyarankan. Petugas memutuskan.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Phone({ d }: { d: TheaterData }) {
  return (
    <div className="w-[320px] max-w-full rounded-[2.75rem] bg-ink p-2.5 shadow-e4 ring-1 ring-white/10">
      <div className="flex h-[600px] flex-col overflow-hidden rounded-[2.2rem] bg-paper text-ink">
        <div className="flex h-11 shrink-0 items-center justify-between px-6 text-caption font-semibold">
          <span>9:41</span>
          <span className="h-5 w-20 rounded-full bg-ink" />
          <span className="h-2.5 w-5 rounded-sm bg-ink" />
        </div>
        <div className="flex shrink-0 items-center gap-3 border-b border-line bg-card px-4 py-3">
          <IconArrowLeft size={20} />
          <div className="min-w-0">
            <p className="text-body font-semibold">Satu pertanyaan singkat</p>
            <p className="truncate text-caption text-muted">{d.facility}</p>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 p-4">
          <div className="rounded-card rounded-tl-md bg-card p-4 shadow-e2">
            <p className="text-body-lg font-semibold leading-snug">Apakah Anda menjalani {d.lay ?? "layanan ini"}{d.when ? ` pada ${d.when}` : ""}?</p>
            <p className="mt-2 text-body-sm text-ink-soft">Lupa atau tidak yakin itu wajar.</p>
          </div>
          {["Ya", "Tidak", "Saya tidak yakin"].map((label, i) => (
            <div key={label} className={`flex min-h-12 items-center gap-3 rounded-card px-4 text-body font-semibold ${i === 2 ? "border border-dashed border-line-strong text-ink-soft" : "bg-card shadow-e1"}`}>
              <span className="size-5 shrink-0 rounded-full border-2 border-line-strong" />
              {label}
            </div>
          ))}
        </div>
        <div className="shrink-0 border-t border-line bg-card px-4 pb-3 pt-3">
          <p className="text-caption text-muted">“Tidak yakin” tidak menambah skor sinyal.</p>
          <div className="mx-auto mt-3 h-1 w-28 rounded-full bg-ink" />
        </div>
      </div>
    </div>
  );
}

function Reveal({ children, className = "", x = 0, y = 32, delay = 0 }: { children: ReactNode; className?: string; x?: number; y?: number; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, x, y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.9, ease: EASE_OUT, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function ProductFocus({ d }: { d: TheaterData }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start end", "start 25%"] });
  const rotateX = useTransform(p, [0, 1], [8, 0]);
  const y = useTransform(p, [0, 1], [40, 0]);

  return (
    <section id="produk" aria-labelledby="produk-judul" className="relative bg-paper pb-24 pt-20 md:pb-40 md:pt-32">
      <div className={WRAP}>
        <Reveal>
          <h2 id="produk-judul" className="max-w-[16ch] text-balance text-title-1 font-semibold tracking-[-0.035em] md:text-headline">
            Satu layar. Semua buktinya.
          </h2>
          <p className="mt-4 max-w-[34rem] text-body-lg text-ink-soft md:text-lead">Temuan, tagihan, catatan faskes, dan jawaban peserta berdampingan. Keputusan tetap di tangan petugas.</p>
        </Reveal>

        <ul className="sr-only">
          {CALLOUTS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>

        <div className="mt-12 flex flex-col items-center gap-0 md:mt-20 xl:flex-row xl:items-start xl:justify-between">
          <div ref={ref} className="w-full [perspective:1400px] lg:w-[54rem] lg:shrink-0" aria-hidden>
            <motion.div style={reduce ? undefined : { rotateX, y, transformOrigin: "50% 0%" }} className="rounded-panel shadow-e3">
              <div className={css.cropMask}>
                <Crop d={d} />
              </div>
            </motion.div>
          </div>
          {d.lay && (
            <Reveal x={reduce ? 0 : 80} y={0} delay={0.2} className="relative z-10 -mt-8 sm:-mt-24 xl:mt-32">
              <div aria-hidden>
                <Phone d={d} />
              </div>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}
