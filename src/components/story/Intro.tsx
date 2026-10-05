"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Term } from "@/components/explain";
import { Head, IconChain, IconColumns, IconEye, Reveal, Section, TLINK } from "./parts";

const PILLARS: { icon: ReactNode; title: string; body: ReactNode }[] = [
  {
    icon: <IconEye />,
    title: "Peserta jadi saksi",
    body: (
      <>
        Peserta menjawab satu pertanyaan di ponsel: “apakah layanan ini benar saya terima?” Itu menjadi <Term k="konfirmasi">konfirmasi peserta</Term>, sinyal, bukan putusan.
      </>
    ),
  },
  {
    icon: <IconColumns />,
    title: "Bukti berdampingan",
    body: (
      <>
        Petugas melihat yang ditagihkan di kiri dan yang terdokumentasi di kanan, dengan <Term k="skor">skor indikasi</Term> dan batas kesimpulan.
      </>
    ),
  },
  {
    icon: <IconChain />,
    title: "Jejak audit tak bisa diubah",
    body: (
      <>
        Setiap langkah tercatat dalam <Term k="rantai">rantai hash</Term>. Satu catatan diubah, rantai putus, langsung ketahuan.
      </>
    ),
  },
];

/** "Apa itu SEHATI?": jawaban langsung untuk pengunjung baru. */
export function WhatIs() {
  return (
    <Section id="apa-itu" tone="paper" screen>
      <Head
        kicker="Apa itu SEHATI?"
        title={
          <>
            Satu episode pasien. <em>Bukan tiga tagihan terpisah.</em>
          </>
        }
        sub="Klaim biasanya diperiksa satu per satu, jadi pola yang baru tampak saat digabung bisa terlewat. SEHATI menyatukannya."
      />
      <div className="mx-auto mt-20 grid max-w-5xl gap-12 md:grid-cols-3 md:gap-10">
        {PILLARS.map((p, i) => (
          <Reveal key={p.title} delay={0.06 * i} className="text-center">
            <div className="mx-auto grid h-11 w-11 place-items-center text-brand">{p.icon}</div>
            <h3 className="mt-4 text-xl font-semibold tracking-tight">{p.title}</h3>
            <p className="mt-2 text-base leading-relaxed text-ink-soft">{p.body}</p>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

const STEPS: { t: string; b: ReactNode }[] = [
  { t: "Satukan", b: <>Klaim dari satu perawatan dikumpulkan ke satu <Term k="episode">episode</Term> dan dicocokkan dengan lembar tindakan.</> },
  { t: "Tanyakan", b: <>Peserta menjawab apakah layanan benar ia terima. Jawabannya menambah bukti.</> },
  { t: "Periksa", b: <>Petugas menilai bukti, meminta klarifikasi, lalu memutuskan. Semua tercatat.</> },
];

/** Cara kerja dalam 3 langkah. */
export function HowItWorks() {
  return (
    <Section tone="white" screen>
      <Head kicker="Cara kerja" title={<>Tiga langkah. <em>Satu kebenaran.</em></>} />
      <ol className="mx-auto mt-20 grid max-w-5xl gap-14 md:grid-cols-3 md:gap-10">
        {STEPS.map((s, i) => (
          <li key={s.t} className="text-center">
            <Reveal delay={0.08 * i}>
              <p className="text-7xl font-semibold leading-none tracking-tight text-ink/15 sm:text-8xl">{i + 1}</p>
              <h3 className="mt-5 text-2xl font-semibold tracking-tight">{s.t}</h3>
              <p className="mx-auto mt-2 max-w-xs text-base leading-relaxed text-ink-soft">{s.b}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}

const DEMO: { n: number; title: string; body: string; cta: string; href: string }[] = [
  { n: 1, title: "Baca cerita Bu Sari", body: "Satu kasus, dari perawatan sampai keputusan.", cta: "Mulai membaca", href: "#sari" },
  { n: 2, title: "Jawab sebagai peserta", body: "Tampilan ponsel peserta.", cta: "Coba sebagai peserta", href: "/m" },
  { n: 3, title: "Lihat hasil di konsol", body: "Apa yang dilihat petugas verifikasi.", cta: "Buka konsol", href: "/console" },
];

/** Panduan demo: jalur tiga langkah. */
export function DemoGuide() {
  return (
    <Section id="panduan" tone="dark" screen>
      <Head dark kicker="Panduan demo" title={<>Coba sendiri. <em>Tiga langkah.</em></>} />
      <ol className="mx-auto mt-20 grid max-w-5xl gap-px overflow-hidden rounded-2xl bg-white/10 md:grid-cols-3">
        {DEMO.map((s, i) => {
          const cls = "group flex h-full flex-col bg-ink p-8 transition-colors hover:bg-[#151816] sm:p-10";
          const inner = (
            <>
              <span className="font-mono text-sm text-white/50">0{s.n}</span>
              <span className="mt-10 block text-2xl font-semibold leading-tight tracking-tight">{s.title}</span>
              <span className="mt-2 block flex-1 text-base text-white/65">{s.body}</span>
              <span className={`${TLINK} mt-10`}>
                {s.cta} <span aria-hidden className="transition-transform group-hover:translate-x-1">›</span>
              </span>
            </>
          );
          return (
            <li key={s.n} className="bg-ink">
              <Reveal delay={0.08 * i} className="h-full">
                {s.href.startsWith("/") ? (
                  <Link href={s.href} className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <a href={s.href} className={cls}>
                    {inner}
                  </a>
                )}
              </Reveal>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
