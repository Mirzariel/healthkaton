"use client";

import { MotionConfig, motion, useScroll, useSpring } from "framer-motion";
import Link from "next/link";
import { useRef } from "react";
import { CodeTag, InfoDot, Term } from "@/components/explain";
import type { GlossaryKey } from "@/lib/glossary";
import type { StoryData } from "@/lib/story";
import { Footer } from "./Footer";
import { Header, Hero } from "./Hero";
import { DemoGuide, HowItWorks, WhatIs } from "./Intro";
import {
  BTN_LINE_DARK,
  BTN_PRIMARY_DARK,
  CountUp,
  EP,
  Head,
  IconFlask,
  IconPlug,
  IconScale,
  Reveal,
  Section,
  sumRupiah,
  TimelineNode,
  TLINK,
} from "./parts";

const STAGE_STATUS = {
  ok: { dot: "bg-ok", label: "Sesuai" },
  warn: { dot: "bg-accent", label: "Perlu dicek" },
  fail: { dot: "bg-danger", label: "Bermasalah" },
  pending: { dot: "bg-muted", label: "Menunggu" },
} as const;

/** Nama awam tiap tagihan + masalahnya, tanpa jargon Inggris di baris utama. */
const CLAIM_PLAIN: Record<string, { name: string; problem: string; k: GlossaryKey; term: string }> = {
  paid: { name: "Perawatan utama", problem: "Tagihan tanpa bukti tindakan", k: "phantom", term: "Phantom billing" },
  dup: { name: "Perawatan yang sama ditagih lagi", problem: "Tagihan ganda", k: "repeat_billing", term: "Repeat billing" },
  split: { name: "“Perawatan baru” yang sebenarnya lanjutan", problem: "Perawatan dipecah", k: "fragmentation", term: "Pemecahan episode" },
};

const RED = "text-[#ff8a8f]";

/* ---------- Halaman ---------- */

export function Story({ d }: { d: StoryData }) {
  const first = d.person.first;
  const hospital = d.person.hospital.replace(/\s*\(simulasi\)/i, "");
  const n = d.events.length;
  const pos = (i: number) => (n > 1 ? (i / (n - 1)) * EP : 0);
  const rises = d.phantom.after > d.phantom.before;
  const total = sumRupiah(d.claims.map((c) => c.amount));

  const tlRef = useRef<HTMLOListElement>(null);
  const { scrollYProgress: tlRaw } = useScroll({ target: tlRef, offset: ["start 80%", "end 55%"] });
  const tl = useSpring(tlRaw, { stiffness: 140, damping: 26, mass: 0.4 });

  return (
    <MotionConfig reducedMotion="user">
      <Header />
      <Hero />
      <WhatIs />
      <HowItWorks />
      <DemoGuide />

      {/* 1. Tokoh */}
      <Section id="sari" tone="white" screen>
        <div className="w-full">
          <Head n={1} kicker="Tokoh" title={<>Bu {first}, {d.person.age} tahun.</>} sub={<>{d.person.dx}. Dirawat {d.person.days} hari. Pulih dan pulang.</>} />
          <Reveal delay={0.15} className="mx-auto mt-16 max-w-xl">
            <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_30px_60px_-30px_rgb(0_0_0/0.25)]">
              <div className="flex items-center justify-between border-b border-line bg-paper px-6 py-3">
                <p className="eyebrow text-muted">
                  Kartu <Term k="episode">episode</Term>
                </p>
                <p className="eyebrow text-muted">{hospital}</p>
              </div>
              <div className="p-6 sm:p-8">
                <p className="text-3xl font-semibold tracking-tight">{d.person.name}</p>
                <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 text-sm">
                  <div><dt className="eyebrow text-muted">Diagnosis</dt><dd className="mt-1 text-base font-medium">{d.person.dx}</dd></div>
                  <div><dt className="eyebrow text-muted">Lama rawat</dt><dd className="mt-1 text-base font-medium">{d.person.days} hari</dd></div>
                  <div><dt className="eyebrow text-muted">Periode</dt><dd className="mt-1 text-base font-medium">{d.person.admit} → {d.person.discharge}</dd></div>
                  <div><dt className="eyebrow text-muted">Hasil</dt><dd className="mt-1 text-base font-medium text-ok">Pulih</dd></div>
                </dl>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* 2. Episode sebagai garis waktu */}
      <Section tone="paper" screen>
        <div className="w-full">
          <Head
            n={2}
            kicker="Satu episode"
            title={<>Satu rangkaian. <em>Satu garis waktu.</em></>}
            sub={<>Inilah <Term k="episode">episode</Term>: semua tindakan sejak masuk sampai pulang.</>}
          />
          <div className="mt-16 rounded-2xl border border-line bg-white p-6 pt-8 sm:p-10">
            <ol ref={tlRef} className="relative md:grid md:grid-flow-col md:auto-cols-fr md:gap-4">
              <span aria-hidden className="absolute bottom-3 left-[13px] top-3 w-px bg-line md:hidden" />
              <motion.span aria-hidden style={{ scaleY: tl }} className="absolute bottom-3 left-[13px] top-3 w-px origin-top bg-ink md:hidden" />
              <span aria-hidden className="absolute left-3 right-3 top-[13px] hidden h-px bg-line md:block" />
              <motion.span aria-hidden style={{ scaleX: tl }} className="absolute left-3 right-3 top-[13px] hidden h-px origin-left bg-ink md:block" />
              {d.events.map((e, i) => (
                <motion.li
                  key={i}
                  className="relative pb-8 pl-12 last:pb-0 md:pb-0 md:pl-0 md:pt-12"
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                >
                  <TimelineNode progress={tl} at={n > 1 ? i / (n - 1) : 0} flagged={e.flagged} />
                  <p className="text-base font-semibold leading-tight">{e.label}</p>
                  <p className="mt-1 font-mono text-xs text-muted">{e.when}</p>
                  {e.flagged && <p className="mt-2 inline-block text-xs font-medium text-danger">Tanpa lembar tindakan</p>}
                </motion.li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      {/* 3. Tiga tagihan */}
      <Section tone="dark">
        <Head
          dark
          n={3}
          kicker="Tiga tagihan"
          title={<>Tiga tagihan <em>untuk satu perawatan.</em></>}
          sub="Satu per satu tampak wajar. Dalam satu garis waktu, masalahnya terlihat."
        />

        <Reveal delay={0.1} className="mt-16">
          <div className="rounded-2xl border border-white/10 bg-[#101312] p-5 sm:p-8">
            <p className="text-sm leading-relaxed text-white/60">
              <span className="text-white">Garis atas</span>: masa rawat Bu {first}. <span className="text-white">Setiap baris di bawahnya</span>: periode yang ditagihkan satu klaim.
            </p>

            {/* Sumbu waktu */}
            <div className="mt-8 grid gap-y-3 md:grid-cols-[17rem_1fr] md:gap-x-8">
              <p className="eyebrow self-end text-white/50">Masa rawat</p>
              <div className="relative h-24 md:h-28">
                <div className="absolute left-0 top-0 text-xs">
                  <p className="eyebrow text-white/50">Masuk</p>
                  <p className="mt-0.5 font-medium text-white">{d.person.admit}</p>
                </div>
                <div className="absolute top-0 text-right text-xs" style={{ right: `${100 - EP}%` }}>
                  <p className="eyebrow text-white/50">Pulang</p>
                  <p className="mt-0.5 font-medium text-white">{d.person.discharge}</p>
                </div>
                <div className="absolute left-0 top-12 h-px bg-white/45" style={{ width: `${EP}%` }} />
                {d.events.map((e, i) => (
                  <span key={i}>
                    <span
                      className={`absolute top-12 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${e.flagged ? "bg-[#ff5a60] ring-4 ring-[#ff5a60]/25" : "bg-white"}`}
                      style={{ left: `${pos(i)}%` }}
                    />
                    {i > 0 && i < n - 1 && (
                      <span
                        className={`absolute top-[3.5rem] hidden w-24 -translate-x-1/2 text-center text-[11px] leading-tight md:block ${e.flagged ? RED : "text-white/55"}`}
                        style={{ left: `${pos(i)}%` }}
                      >
                        {e.label}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>

            {/* Baris tagihan */}
            <div className="mt-8 space-y-7 border-t border-white/10 pt-8">
              {d.claims.map((c, i) => {
                const p = CLAIM_PLAIN[c.key];
                const isSplit = c.key === "split";
                return (
                  <div key={c.key} className="grid gap-y-3 md:grid-cols-[17rem_1fr] md:gap-x-8">
                    <div>
                      <p className="eyebrow text-white/50">Tagihan {i + 1}</p>
                      <p className="mt-1 text-lg font-semibold leading-snug">{p.name}</p>
                      <p className="mt-1.5 text-xs text-white/55">
                        No. klaim <CodeTag k="klaim" className="text-white/75">{c.no}</CodeTag>
                      </p>
                      <p className={`mt-2.5 inline-flex flex-wrap items-center gap-x-2 text-sm font-medium ${RED}`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-[#ff5a60]" aria-hidden />
                        {p.problem}
                        <span className="text-xs font-normal text-white/50">
                          (<Term k={p.k}>{p.term}</Term>)
                        </span>
                      </p>
                    </div>
                    <div className="relative">
                      <span aria-hidden className="pointer-events-none absolute inset-y-0 border-l border-dashed border-white/20" style={{ left: `${EP}%` }} />
                      <div className="relative h-11">
                        <motion.div
                          className="absolute top-0 flex h-11 items-center justify-end rounded-md bg-white px-3 text-sm font-semibold tabular-nums text-ink"
                          style={{ left: isSplit ? `${EP}%` : 0, width: isSplit ? `${100 - EP}%` : `${EP}%`, transformOrigin: "left" }}
                          initial={{ scaleX: 0, opacity: 0 }}
                          whileInView={{ scaleX: 1, opacity: 1 }}
                          viewport={{ once: true, margin: "-40px" }}
                          transition={{ delay: 0.15 * i, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <span className="whitespace-nowrap">{c.amount}</span>
                        </motion.div>
                      </div>
                      <p className="mt-2 text-sm text-white/60">
                        {c.status}. {c.note}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Ringkasan */}
            <div className="mt-10 grid grid-cols-3 gap-4 border-t border-white/20 pt-8">
              <div>
                <p className="eyebrow text-white/50">Seharusnya ditagihkan</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-4xl">1 klaim</p>
              </div>
              <div>
                <p className="eyebrow text-white/50">Yang masuk</p>
                <p className={`mt-2 text-2xl font-semibold tracking-tight sm:text-4xl ${RED}`}>{d.claims.length} klaim</p>
              </div>
              <div>
                <p className="eyebrow text-white/50">Total tagihan</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-4xl">{total}</p>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* 4. Enam tahap */}
      <Section tone="paper">
        <Head
          n={4}
          kicker="SEHATI"
          title={<>Enam proses. <em>Satu alur.</em></>}
          sub={
            <>
              Hasil sungguhan <Term k="tahap">mesin pemeriksa</Term> pada klaim kedua {first}, <CodeTag k="klaim">{d.claims[1].no}</CodeTag>.
            </>
          }
        />
        <ol className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {d.stages.map((s, i) => {
            const st = STAGE_STATUS[s.status];
            return (
              <li key={s.key} className="bg-white">
                <Reveal delay={0.05 * i} className="h-full p-6 sm:p-7">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-muted">0{i + 1}</span>
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-ink-soft">
                      <span className={`h-2 w-2 rounded-full ${st.dot}`} aria-hidden />
                      {st.label}
                    </span>
                  </div>
                  <p className="mt-6 text-xl font-semibold tracking-tight">{s.label}</p>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-soft">{s.notes[0]}</p>
                </Reveal>
              </li>
            );
          })}
        </ol>
      </Section>

      {/* 5. Peserta */}
      <Section tone="white" screen>
        <div className="grid w-full items-center gap-16 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <Reveal>
              <p className="eyebrow text-muted">05 — Peserta</p>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-5 text-balance text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">
                Bu {first} tahu apakah {d.phantom.item.toLowerCase()} itu <em>terjadi.</em>
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mx-auto mt-6 max-w-md text-lg leading-relaxed text-ink-soft lg:mx-0">Satu jawabannya menjadi sinyal bagi pemeriksa. Bukan putusan.</p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="mx-auto mt-10 max-w-md border-t border-ink pt-6 text-left lg:mx-0">
                <p className="eyebrow flex items-center gap-1.5 text-muted">
                  Skor <Term k="phantom">phantom billing</Term> <InfoDot k="skor" />
                </p>
                <div className="mt-3 flex items-end gap-4">
                  {rises && (
                    <>
                      <p className="text-5xl font-semibold tabular-nums tracking-tight text-ink/35">{d.phantom.before}</p>
                      <p className="pb-2 text-ink/40" aria-hidden>→</p>
                    </>
                  )}
                  <CountUp value={String(d.phantom.after)} from={rises ? d.phantom.before : 0} delay={0.6} className="text-7xl font-semibold leading-none tracking-tight" />
                </div>
                <p className="mt-2 text-sm text-ink-soft">{rises ? "naik bila ia menjawab “tidak sesuai”" : "dari bukti dokumen dan jawaban peserta"}</p>
                <div className="relative mt-5 h-1.5 rounded-full bg-line" aria-hidden>
                  {rises && <div className="absolute inset-y-0 left-0 rounded-full bg-ink/25" style={{ width: `${d.phantom.before}%` }} />}
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full bg-ink"
                    style={{ width: `${d.phantom.after}%`, transformOrigin: "left" }}
                    initial={{ scaleX: rises ? d.phantom.before / Math.max(1, d.phantom.after) : 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.6, duration: 1, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.2} className="mt-8">
              <Link href="/m" className={`${TLINK} text-brand`}>
                Coba sebagai Bu {first} <span aria-hidden>›</span>
              </Link>
            </Reveal>
          </div>

          {/* Perangkat: layar konfirmasi peserta */}
          <Reveal delay={0.1}>
            <div className="mx-auto w-[290px]" aria-hidden>
              <div className="rounded-[2.8rem] bg-ink p-[9px] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.45)] ring-1 ring-black/20">
                <div className="relative overflow-hidden rounded-[2.3rem] bg-white p-5 pt-11 text-ink">
                  <span className="absolute left-1/2 top-3 h-5 w-20 -translate-x-1/2 rounded-full bg-ink" />
                  <p className="eyebrow text-muted">Konfirmasi layanan</p>
                  <p className="mt-2 text-lg font-semibold leading-snug tracking-tight">Apakah {d.phantom.item} Anda terima?</p>
                  <p className="mt-1 text-xs text-muted">{d.phantom.date} · {hospital}</p>
                  <div className="mt-6 space-y-2 text-sm font-medium">
                    <span className="block rounded-xl border border-line py-3 text-center">Sesuai</span>
                    <span className="block rounded-xl bg-ink py-3 text-center text-white">Tidak sesuai</span>
                    <span className="block rounded-xl border border-line py-3 text-center">Tidak ingat</span>
                  </div>
                  <p className="mt-5 text-center text-[11px] text-muted">Jawaban menjadi sinyal, bukan putusan.</p>
                  <span className="mx-auto mt-5 block h-1 w-20 rounded-full bg-ink/80" />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* 6. Petugas */}
      <Section tone="paper">
        <Head
          n={6}
          kicker="Petugas"
          title={<>Ditagihkan di kiri. <em>Terdokumentasi di kanan.</em></>}
          sub="“Bukti kurang” bukan berarti “tidak dilakukan”. Petugas meminta klarifikasi, lalu memutuskan."
        >
          <Link href="/console" className={`${TLINK} text-brand`}>
            Buka konsol petugas <span aria-hidden>›</span>
          </Link>
        </Head>
        <Reveal delay={0.1} className="mx-auto mt-16 max-w-4xl">
          <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_40px_80px_-40px_rgb(0_0_0/0.3)]">
            <div className="flex items-center gap-2 border-b border-line bg-paper px-4 py-3" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
              <span className="ml-3 font-mono text-xs text-muted">Konsol petugas · {d.claims[0].no}</span>
            </div>
            <div className="hidden grid-cols-2 gap-2 border-b border-line px-5 py-3 sm:grid">
              <span className="eyebrow text-muted">Ditagihkan</span>
              <span className="eyebrow flex items-center gap-1.5 text-muted">Terdokumentasi <InfoDot k="bukti" /></span>
            </div>
            {d.rows.map((r, i) => {
              const label = { tersedia: "Bukti tersedia", kurang: "Bukti kurang", bertentangan: "Bukti bertentangan" }[r.state];
              const tone = r.state === "tersedia" ? "text-ok" : r.state === "kurang" ? "text-warn" : "text-danger";
              const dot = r.state === "tersedia" ? "bg-ok" : r.state === "kurang" ? "bg-accent" : "bg-danger";
              return (
                <Reveal key={i} delay={0.05 * i}>
                  <div className="grid gap-2 border-b border-line px-5 py-4 last:border-0 sm:grid-cols-2">
                    <div>
                      <p className="font-medium">{r.name}</p>
                      <p className="font-mono text-xs text-muted">{r.meta}</p>
                    </div>
                    <div>
                      <p className={`inline-flex items-center gap-2 text-sm font-medium ${tone}`}>
                        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
                        {label}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-soft">{r.reason}</p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </Reveal>
      </Section>

      {/* 7. Audit */}
      <Section tone="dark" screen bg={{ src: "/images/casemix-laptop.jpg", alt: "Tangan mengetik di laptop dengan stetoskop di dekatnya (foto suasana)", position: "center 45%" }}>
        <div className="w-full">
          <Head dark n={7} kicker="Jejak audit" title={<>Setiap langkah tercatat. <em>Tak bisa diubah diam-diam.</em></>} />
          <div className="mx-auto mt-16 flex max-w-4xl flex-col items-stretch gap-2 md:flex-row md:items-center" aria-hidden>
            {["Kasus dibuka", "Konfirmasi peserta", "Klarifikasi", "Keputusan"].map((t, i) => (
              <div key={t} className="flex flex-1 flex-col items-stretch gap-2 md:flex-row md:items-center">
                <motion.div
                  className="flex-1 rounded-lg border border-white/20 bg-black/60 px-4 py-3 text-left"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: 0.25 * i, duration: 0.4, ease: "easeOut" }}
                >
                  <p className="text-sm font-medium">{t}</p>
                  <p className="mt-1 font-mono text-[10px] text-white/55">
                    <Term k="hash">hash</Term> {["a91f", "3c07", "e5b2", "7d40"][i]}…
                  </p>
                </motion.div>
                {i < 3 && <span className="self-center text-white/40 md:rotate-0" aria-hidden>›</span>}
              </div>
            ))}
          </div>
          <dl className="mx-auto mt-16 grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/15 bg-white/15 sm:grid-cols-4">
            {[
              [String(d.stats.claims), "klaim diperiksa"],
              [String(d.stats.cases), "kasus dibuka otomatis"],
              [`${d.stats.avgDays} hari`, "rata-rata sampai keputusan"],
              [d.stats.atRisk, "nilai klaim pada kasus aktif"],
            ].map(([v, l], i) => (
              <div key={l} className="bg-black/70 p-5 sm:p-6">
                <dd className="text-3xl font-semibold tracking-tight sm:text-4xl"><CountUp value={v} delay={0.1 * i} /></dd>
                <dt className="mt-2 text-xs text-white/65">{l}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-center text-sm text-white/70">
            <Term k="rantai">Rantai hash</Term> {d.stats.chainOk ? "utuh" : "RUSAK"} pada {d.stats.chainTotal} entri. {d.stats.cleared} kasus sah diloloskan.
          </p>
        </div>
      </Section>

      {/* 8. Batas */}
      <Section id="batas" tone="white" screen>
        <div className="w-full">
          <Head n={8} kicker="Batas" title={<>Yang SEHATI <em>tidak</em> klaim.</>} sub="Kami lebih memilih jujur soal batasnya daripada berjanji berlebihan." />
          <div className="mx-auto mt-20 grid max-w-5xl gap-12 md:grid-cols-3 md:gap-10">
            {[
              [<IconScale key="i" />, "Indikasi, bukan putusan", "Keputusan tetap di tangan petugas."],
              [<IconFlask key="i" />, "Data contoh", "Nama dan angka dibuat otomatis. Dampak nyata butuh pilot."],
              [<IconPlug key="i" />, "Konsep, bukan integrasi", "Belum terhubung ke JKN Mobile, SIMRS, atau layanan resmi."],
            ].map(([ic, t, b], i) => (
              <Reveal key={String(t)} delay={0.08 * i} className="text-center">
                <div className="mx-auto grid h-11 w-11 place-items-center text-brand">{ic}</div>
                <p className="mt-4 text-xl font-semibold tracking-tight">{t}</p>
                <p className="mx-auto mt-2 max-w-xs text-base text-ink-soft">{b}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* 9. Penutup */}
      <Section tone="dark" screen bg={{ src: "/images/clinician-tablet.jpg", alt: "Tangan tenaga kesehatan memegang tablet (foto suasana)", position: "center 40%" }}>
        <div className="w-full">
          <Head dark n={9} kicker="Coba sendiri" title={<>Detect smarter. <em>Protect JKN.</em></>} sub="Jalankan dua sisi prototipe dan lihat bagaimana satu jawaban peserta bertemu dengan bukti petugas.">
            <Link href="/m" className={BTN_PRIMARY_DARK}>Sisi peserta</Link>
            <Link href="/console" className={BTN_LINE_DARK}>Konsol petugas</Link>
          </Head>
          <Reveal delay={0.2} className="mt-8 text-center">
            <Link href="/console/precheck" className={`${TLINK} text-white`}>
              Atau coba pra-pengajuan klaim <span aria-hidden>›</span>
            </Link>
          </Reveal>
        </div>
      </Section>
      <Footer />
    </MotionConfig>
  );
}
