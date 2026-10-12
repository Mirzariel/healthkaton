import Link from "next/link";
import type { ReactNode } from "react";
import { IconArrowUpRight, IconCheck } from "@/components/icons";
import SehatiLogo from "@/components/SehatiLogo";
import { AiModeBadge, SourceBadge, StatusPill } from "@/components/ui";
import type { AdapterStatus } from "@/lib/adapters/types";
import { PROOF_LABEL } from "@/lib/labels";
import { ADAPTER_NAME } from "@/components/adapterNames";
import { Photo } from "./Photo";

export const WRAP = "mx-auto w-full max-w-[80rem] px-5 md:px-10";

/* Label konteks kecil di atas judul bagian (huruf biasa). */
function Kicker({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return <p className={`text-[14px] font-medium ${dark ? "text-mint" : "text-brand"}`}>{children}</p>;
}

/* ---------- Tesis: celah antara yang ditagih, yang tercatat, dan yang diterima ---------- */

export interface ThesisData {
  service: string | null;
  amount: string | null;
  documented: boolean;
  lay: string | null;
}

export function ThesisSection({ d }: { d: ThesisData }) {
  const rows: { line: string; value: ReactNode; gap?: boolean; strong?: boolean }[] = [
    { line: "Klaim mencatat apa yang ditagih.", value: d.service ? <>{d.service}, <span className="tabular-nums">{d.amount}</span></> : "Tagihan layanan" },
    { line: "Faskes mencatat apa yang dikerjakan.", value: d.documented ? "Catatan pelaksanaan ditemukan" : "Catatan pelaksanaan belum ditemukan", gap: !d.documented },
    { line: "Hanya peserta yang tahu apa yang diterima.", value: d.lay ? `Ditanya langsung: ${d.lay}` : "Ditanya langsung", strong: true },
  ];
  return (
    <section id="tesis" aria-labelledby="tesis-judul" className="scroll-mt-16 bg-paper py-16 md:py-36">
      <div className={WRAP}>
        <Kicker>Mengapa SEHATI ada</Kicker>
        <h2 id="tesis-judul" className="sr-only">Celah antara layanan yang ditagih dan yang diterima</h2>
        <ol className="mt-8 border-t border-ink/15">
          {rows.map((r, i) => (
            <li key={i} className="grid items-baseline gap-x-10 gap-y-3 border-b border-ink/15 py-8 md:grid-cols-[minmax(0,1fr)_20rem] md:py-10">
              <p className={`text-[2rem] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[2.6rem] lg:text-[3.4rem] ${r.strong ? "text-brand-ink" : "text-ink"}`}>{r.line}</p>
              <p className="flex items-start gap-2.5 text-[14px] leading-snug text-ink-soft md:justify-end md:text-right">
                <span aria-hidden className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${r.gap ? "bg-accent" : r.strong ? "bg-brand" : "bg-line-strong"} md:order-2`} />
                <span>{r.value}</span>
              </p>
            </li>
          ))}
        </ol>
        <div className="mt-12 grid gap-6 md:grid-cols-[minmax(0,1fr)_20rem] md:gap-10">
          <p className="max-w-2xl text-[1.35rem] font-medium leading-snug tracking-[-0.015em] text-ink md:text-[1.6rem]">
            SEHATI mempertemukan ketiganya dalam satu episode, sehingga celahnya terlihat dan bisa ditutup dengan adil.
          </p>
          <p className="text-[13px] leading-relaxed text-muted md:text-right">Contoh nyata dari demo: episode Bu Sari, peserta sintetis.</p>
        </div>
      </div>
    </section>
  );
}

/* ---------- Pita foto: dari satu laporan menjadi peta mutu ---------- */

export function WardBand() {
  return (
    <section aria-labelledby="pita-judul" className="relative isolate min-h-[26rem] overflow-hidden bg-night md:min-h-[42rem]">
      <div className="absolute inset-0 -z-10">
        <Photo k="ward" sizes="100vw" className="object-[50%_60%] opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/55 to-night/10" />
      </div>
      <div className={`${WRAP} flex min-h-[26rem] flex-col justify-end pb-12 md:min-h-[42rem] md:pb-24`}>
        <h2 id="pita-judul" className="max-w-3xl text-[2.1rem] font-semibold leading-[1.06] tracking-[-0.035em] text-white sm:text-[2.8rem] lg:text-[3.6rem]">
          Satu laporan ditindaklanjuti. Laporan yang cukup menjadi peta mutu.
        </h2>
        <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-on-night-soft md:text-[17px]">
          Dasbor mutu baru menyimpulkan setelah jumlah responden memenuhi batas minimum.
        </p>
      </div>
    </section>
  );
}

/* ---------- Cara kerja: urutan pembuktian ---------- */

const FLOW = [
  { status: "signal", title: "Sinyal", body: "Aturan menandai selisih. Belum kesimpulan." },
  { status: "awaiting_clarification", title: "Klarifikasi", body: "Faskes diminta menjawab, dengan bukti." },
  { status: "verified", title: "Keputusan", body: "Petugas menilai. Reviewer menyetujui." },
  { status: null, title: "Perbaikan", body: "Tindakan dicatat, lalu diukur ulang." },
] as const;

const STAGES = [
  ["Sebelum layanan", "Apa yang dijanjikan"],
  ["Selama layanan", "Apa yang sedang terjadi"],
  ["Setelah layanan", "Apa yang diterima"],
  ["Konfirmasi terarah", "Satu pertanyaan, satu layanan"],
] as const;

export function HowSection({ live }: { live: boolean }) {
  return (
    <section id="cara-kerja" aria-labelledby="cara-judul" className="scroll-mt-16 bg-paper py-16 md:py-36">
      <div className={WRAP}>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_22rem] md:items-end">
          <div>
            <Kicker>Cara kerja</Kicker>
            <h2 id="cara-judul" className="mt-4 max-w-2xl text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[3rem]">Dari sinyal sampai perbaikan, tanpa lompatan.</h2>
          </div>
          <p className="text-[15px] leading-relaxed text-ink-soft">Setiap langkah punya pemilik, tenggat, dan jejak audit.</p>
        </div>

        <ol className="relative mt-10 grid gap-6 before:absolute before:bottom-5 before:left-5 before:top-5 before:w-px before:bg-line-strong md:mt-16 md:grid-cols-4 md:before:hidden">
          <span aria-hidden className="absolute left-0 right-0 top-[19px] hidden h-px bg-ink/15 md:block" />
          {FLOW.map((s, i) => (
            <li key={s.title} className="relative pl-14 md:pl-0">
              <span className={`absolute left-0 top-0 grid h-10 w-10 place-items-center rounded-full text-[14px] font-semibold tabular-nums ring-8 ring-paper md:relative ${i === 3 ? "bg-brand text-white" : "bg-card text-ink shadow-depth-1 ring-offset-0"}`}>
                {i + 1}
              </span>
              <h3 className="pt-1 text-[1.35rem] font-semibold tracking-tight md:mt-6 md:pt-0">{s.title}</h3>
              <p className="mt-2 max-w-[16rem] text-[15px] leading-relaxed text-ink-soft">{s.body}</p>
              <div className="mt-4">
                {s.status ? <StatusPill tone={PROOF_LABEL[s.status].tone}>{PROOF_LABEL[s.status].label}</StatusPill> : <StatusPill tone="info">Tindakan perbaikan</StatusPill>}
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 rounded-2xl bg-card p-5 shadow-depth-2 ring-1 ring-line md:mt-20 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[1.1rem] font-semibold tracking-tight">Peserta ditanya pada saat yang tepat</h3>
            <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
              <AiModeBadge mode={live ? "live" : "simulated"} />
            </span>
          </div>
          <ol className="mt-6 grid gap-px overflow-hidden rounded-xl bg-line sm:grid-cols-2 lg:grid-cols-4">
            {STAGES.map(([t, d], i) => (
              <li key={t} className="bg-card p-4">
                <p className="text-[12px] font-medium tabular-nums text-muted">Tahap {i + 1}</p>
                <p className="mt-1 text-[15px] font-semibold">{t}</p>
                <p className="mt-0.5 text-[14px] text-ink-soft">{d}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[13px] text-muted">AI memilih pertanyaan dari bank yang sudah ditinjau dan merangkum. AI tidak menyimpulkan penyebab dan tidak memutuskan.</p>
        </div>
      </div>
    </section>
  );
}

/* ---------- Tiga sisi satu episode ---------- */

const SIDES = [
  { who: "Peserta", line: "Menjawab singkat, dengan kata-kata sendiri. Ragu-ragu boleh.", href: "/m", cta: "Buka aplikasi peserta" },
  { who: "Faskes", line: "Menjawab dengan bukti dan menyusun perbaikan. Hak jawab lebih dulu.", href: "/faskes", cta: "Buka portal faskes" },
  { who: "Petugas", line: "Membuktikan dan memutuskan. AI membantu menyiapkan.", href: "/console", cta: "Buka konsol petugas" },
];

export function SidesSection() {
  return (
    <section id="peran" aria-labelledby="peran-judul" className="scroll-mt-16 bg-subtle py-16 md:py-36">
      <div className={`${WRAP} grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-20`}>
        <div className="relative">
          <div className="aspect-[4/3] overflow-hidden rounded-[20px] shadow-[0_30px_80px_-30px_rgb(11_23_20/0.45)]">
            <Photo k="consult" sizes="(min-width: 1024px) 45vw, 100vw" className="object-[50%_45%]" />
          </div>
          <div className="absolute -bottom-6 left-5 right-5 rounded-xl bg-card/95 p-4 shadow-depth-3 ring-1 ring-line backdrop-blur sm:left-auto sm:right-6 sm:w-72">
            <p className="text-[12px] font-medium text-muted">Satu episode perawatan</p>
            <p className="mt-1 text-[15px] font-semibold leading-snug">Tiga sudut pandang, satu catatan yang sama.</p>
          </div>
        </div>
        <div>
          <Kicker>Untuk siapa</Kicker>
          <h2 id="peran-judul" className="mt-4 text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[3rem]">Satu episode. Tiga sisi.</h2>
          <ul className="mt-10 border-t border-ink/15">
            {SIDES.map((s) => (
              <li key={s.who} className="border-b border-ink/15">
                <Link href={s.href} className="group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-2 py-5 sm:grid-cols-[8.5rem_minmax(0,1fr)_auto] sm:py-6">
                  <span className="text-[1.25rem] font-semibold tracking-tight">{s.who}</span>
                  <span className="col-start-1 row-start-2 text-[15px] leading-relaxed text-ink-soft sm:col-auto sm:row-auto">
                    {s.line}
                    <span className="sr-only">. {s.cta}</span>
                  </span>
                  <IconArrowUpRight size={18} className="col-start-2 row-start-1 self-center text-muted transition-colors group-hover:text-brand sm:col-auto sm:row-auto" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------- Prinsip (bagian gelap) ---------- */

export const PRINCIPLES = [
  "Penyebab baru dibicarakan setelah masalah terbukti dan faskes sempat menjawab.",
  "Tanda awal disebut sinyal, bukan kesimpulan. Bahasa dijaga netral.",
  "Jawaban “tidak tahu”, “tidak paham”, atau tidak menjawab tidak menambah kecurigaan.",
  "Kepuasan peserta tidak pernah menjadi dasar indikasi.",
  "Tidak ada pembayaran, koreksi klaim, atau sanksi otomatis.",
  "Setiap perubahan tercatat di jejak audit berantai hash.",
];

export function PrinciplesSection() {
  return (
    <section id="prinsip" aria-labelledby="prinsip-judul" className="scroll-mt-16 bg-night py-16 text-on-night md:py-36">
      <div className={WRAP}>
        <Kicker dark>Prinsip yang ditegakkan sistem</Kicker>
        <h2 id="prinsip-judul" className="mt-5 max-w-4xl text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.04em] text-white sm:text-[3.6rem] lg:text-[4.6rem]">
          AI menyarankan. Manusia memutuskan.
        </h2>
        <ul className="mt-8 grid gap-x-12 border-t border-white/10 md:mt-16 md:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <li key={p} className="flex gap-4 border-b border-white/10 py-6">
              <IconCheck size={18} className="mt-1 shrink-0 text-mint" />
              <span className="text-[16px] leading-relaxed text-on-night">{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Batas yang jujur ---------- */



export interface Counts { p: number; f: number; fi: number; v: number }

export function LimitsSection({ statuses, n }: { statuses: AdapterStatus[]; n: Counts }) {
  const stats: [number, string][] = [[n.p, "peserta"], [n.f, "faskes"], [n.fi, "temuan berstatus sinyal atau lebih"], [n.v, "temuan terbukti"]];
  return (
    <section id="integrasi" aria-labelledby="batas-judul" className="scroll-mt-16 bg-paper py-16 md:py-32">
      <div className={`${WRAP} grid gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20`}>
        <div>
          <Kicker>Transparan</Kicker>
          <h2 id="batas-judul" className="mt-4 text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[3rem]">Jujur tentang batasnya.</h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-soft">Ini prototipe dengan data sintetis. Setiap sumber data menyebut statusnya sendiri.</p>
          <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8">
            {stats.map(([v, l]) => (
              <div key={l}>
                <dd className="text-[2.4rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">{v.toLocaleString("id-ID")}</dd>
                <dt className="mt-2 text-[13px] text-muted">{l}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-8 max-w-md text-[12.5px] leading-relaxed text-muted">Jumlah temuan adalah hasil aturan pada data rekaan, bukan prevalensi di dunia nyata.</p>
        </div>
        <div className="self-start overflow-hidden rounded-2xl bg-card shadow-depth-2 ring-1 ring-line">
          <p className="border-b border-line px-5 py-4 text-[14px] font-semibold">Status integrasi</p>
          <ul className="divide-y divide-line">
            {statuses.map((s) => (
              <li key={s.name} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[14.5px] font-medium">{ADAPTER_NAME[s.name] ?? s.name}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{s.detail}</p>
                </div>
                <SourceBadge source={s.source} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------- Ajakan penutup ---------- */

const DOORS = [
  { href: "/m", title: "Aplikasi peserta", body: "Mulai dari pertanyaan Bu Sari." },
  { href: "/faskes", title: "Portal faskes", body: "Jawab klarifikasi dengan bukti." },
  { href: "/console", title: "Konsol petugas", body: "Periksa sinyal dan putuskan." },
];

export function FinalSection() {
  return (
    <section aria-labelledby="akhir-judul" className="relative isolate overflow-hidden bg-night py-16 text-on-night md:py-36">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(50%_60%_at_15%_0%,rgb(47_165_143/0.14),transparent_70%)]" />
      <div className={WRAP}>
        <h2 id="akhir-judul" className="max-w-3xl text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.04em] text-white sm:text-[3.6rem]">Lihat sistemnya bekerja.</h2>
        <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-on-night-soft">Tiga pintu ke data demo yang sama. Perubahan di satu sisi langsung terlihat di sisi lain.</p>
        <ul className="mt-14 grid gap-4 md:grid-cols-3">
          {DOORS.map((d) => (
            <li key={d.href}>
              <Link href={d.href} className="group flex h-full flex-col justify-between rounded-2xl bg-night-2 p-6 ring-1 ring-white/10 transition-colors hover:bg-night-3 hover:ring-white/20">
                <div>
                  <p className="text-[1.25rem] font-semibold tracking-tight text-white">{d.title}</p>
                  <p className="mt-2 text-[15px] text-on-night-soft">{d.body}</p>
                </div>
                <IconArrowUpRight size={20} className="mt-10 text-on-night-soft transition-colors group-hover:text-mint" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-night py-12 text-on-night-soft">
      <div className={`${WRAP} grid gap-8 md:grid-cols-[minmax(0,1fr)_auto]`}>
        <div className="max-w-2xl">
          <SehatiLogo size={24} inverse />
          <p className="mt-5 text-[13px] leading-relaxed">
            Prototipe Healthkathon 2026 untuk efisiensi risiko pada fasilitas kesehatan. Seluruh data sintetis. SEHATI bukan produk resmi BPJS Kesehatan dan tidak memiliki integrasi langsung. AI hanya menyarankan; tidak ada pembayaran, koreksi klaim, atau sanksi otomatis.
          </p>
          <p className="mt-3 text-[12px] text-on-night-soft">Foto: <a href="https://unsplash.com/license" className="underline decoration-white/30 underline-offset-4 hover:text-white">Unsplash</a>.</p>
        </div>
        <nav aria-label="Pintu demo" className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] font-medium md:flex-col md:items-end">
          <Link href="/m" className="hover:text-white">Aplikasi peserta</Link>
          <Link href="/faskes" className="hover:text-white">Portal faskes</Link>
          <Link href="/console" className="hover:text-white">Konsol petugas</Link>
        </nav>
      </div>
    </footer>
  );
}
