import Image from "next/image";
import Link from "next/link";
import { ADAPTER_NAME } from "@/components/adapterNames";
import { IconArrowUpRight, IconChevronDown } from "@/components/icons";
import { CountUp } from "@/components/motion";
import SehatiLogo from "@/components/SehatiLogo";
import { SourceBadge } from "@/components/ui";
import type { AdapterStatus } from "@/lib/adapters/types";
import { WRAP } from "./data";
import css from "./landing.module.css";

/* Bagian penutup (server): batas yang jujur, pintu demo (bento), dan kaki halaman. */

export interface Counts {
  p: number;
  f: number;
  fi: number;
  v: number;
}

export function Limits({ statuses, n }: { statuses: AdapterStatus[]; n: Counts }) {
  const stats: [number, string][] = [
    [n.p, "peserta"],
    [n.f, "faskes"],
    [n.fi, "temuan"],
    [n.v, "terbukti"],
  ];
  return (
    <section id="batas" aria-labelledby="batas-judul" className={`bg-night pb-24 text-on-night md:pb-28 ${css.grain}`}>
      <div className={WRAP}>
        <div className="border-t border-white/10 pt-16 md:pt-20">
          <h2 id="batas-judul" className="text-balance text-title-1 font-semibold tracking-[-0.035em] text-white md:text-headline">Jujur tentang batasnya.</h2>
          <p className="mt-4 max-w-[30rem] text-body-lg text-on-night-soft">Prototipe dengan data sintetis. Setiap sumber data menyebut statusnya sendiri.</p>
          <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 md:mt-16 md:grid-cols-4">
            {stats.map(([v, l]) => (
              <div key={l} className="flex flex-col-reverse">
                <dt className="mt-2 text-body-sm text-on-night-soft">{l}</dt>
                <dd className="text-headline font-semibold leading-none tracking-[-0.04em] tabular-nums text-white">
                  <CountUp value={v} />
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-8 max-w-[34rem] text-body-sm text-on-night-soft">Jumlah temuan adalah hasil aturan pada data rekaan, bukan prevalensi di dunia nyata.</p>

          <details className="mt-10 overflow-hidden rounded-panel bg-white/4 ring-1 ring-inset ring-white/10">
            <summary className={`flex min-h-14 items-center justify-between gap-4 px-5 text-body font-semibold text-white md:px-6 ${css.summary}`}>
              Status integrasi ({statuses.length} sumber)
              <IconChevronDown size={18} className={css.chev} />
            </summary>
            <ul className="divide-y divide-line bg-card text-ink">
              {statuses.map((s) => (
                <li key={s.name} className="flex items-start justify-between gap-4 px-5 py-4 md:px-6">
                  <div className="min-w-0">
                    <p className="text-body font-medium">{ADAPTER_NAME[s.name] ?? s.name}</p>
                    <p className="mt-0.5 text-body-sm text-muted">{s.detail}</p>
                  </div>
                  <SourceBadge source={s.source} />
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </section>
  );
}

function Arrow({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${dark ? "bg-white/10 text-white" : "bg-ink/5 text-ink"}`}>
      <IconArrowUpRight size={18} />
    </span>
  );
}

export function Doors() {
  return (
    <section id="coba" aria-labelledby="coba-judul" className="bg-paper pb-20 pt-20 md:pb-28 md:pt-28">
      <div className={WRAP}>
        <h2 id="coba-judul" className="text-headline font-semibold tracking-[-0.04em] md:text-display">Coba sendiri.</h2>
        <p className="mt-4 max-w-[30rem] text-body-lg text-ink-soft">Tiga pintu ke data demo yang sama. Ubah di satu sisi, lihat hasilnya di sisi lain.</p>

        <ul className="mt-12 grid gap-4 md:mt-16 md:grid-cols-3 md:grid-rows-[minmax(16rem,auto)_minmax(16rem,auto)] md:gap-5">
          {/* Peserta: ubin tinggi */}
          <li className="md:row-span-2">
            <Link href="/m" className={`group relative flex h-full min-h-[26rem] flex-col overflow-hidden rounded-media bg-night p-6 text-white shadow-e2 md:p-8 ${css.lift} ${css.grain}`}>
              <div aria-hidden className={`absolute inset-0 -z-10 ${css.glow}`} />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-body-sm font-medium text-mint">Peserta</p>
                  <p className="mt-2 text-title-1 font-semibold tracking-[-0.03em]">Aplikasi peserta</p>
                  <p className="mt-2 text-body text-on-night-soft">Mulai dari pertanyaan Bu Sari.</p>
                </div>
                <Arrow dark />
              </div>
              <div aria-hidden className="mt-auto space-y-2.5 pt-10">
                <div className="rounded-card rounded-bl-md bg-white p-4 text-ink shadow-e3">
                  <p className="text-body font-semibold leading-snug">Apakah Anda menjalani pemeriksaan ini?</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["Ya", "Tidak", "Tidak yakin"].map((x) => (
                    <span key={x} className="rounded-full bg-white/10 px-4 py-2 text-body-sm font-medium text-white ring-1 ring-inset ring-white/15">
                      {x}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          </li>

          {/* Faskes */}
          <li className="md:col-span-2">
            <Link href="/faskes" className={`group relative flex h-full min-h-[16rem] flex-col justify-between overflow-hidden rounded-media bg-card p-6 text-ink shadow-e1 ring-1 ring-line md:p-8 ${css.lift}`}>
              <div className="relative z-10 flex items-start justify-between gap-4">
                <div className="max-w-[22rem]">
                  <p className="text-body-sm font-medium text-brand">Faskes</p>
                  <p className="mt-2 text-title-1 font-semibold tracking-[-0.03em]">Portal faskes</p>
                  <p className="mt-2 text-body text-ink-soft">Jawab klarifikasi dengan bukti. Hak jawab lebih dulu.</p>
                </div>
                <Arrow />
              </div>
              <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[45%] md:block">
                <Image src="/images/clinician-tablet.jpg" alt="" fill sizes="30vw" className="object-cover object-[60%_50%]" />
                <div className="absolute inset-0 bg-gradient-to-r from-card via-card/40 to-transparent" />
              </div>
            </Link>
          </li>

          {/* Petugas: ubin lebar */}
          <li className="md:col-span-2">
            <Link href="/console" className={`group relative flex h-full min-h-[16rem] flex-col justify-between overflow-hidden rounded-media bg-brand p-6 text-white shadow-e2 md:p-8 ${css.lift}`}>
              <div aria-hidden className="absolute inset-0 bg-[radial-gradient(70%_90%_at_100%_100%,rgb(143_211_195/0.28),transparent_70%)]" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="max-w-[24rem]">
                  <p className="text-body-sm font-medium text-mint">Petugas</p>
                  <p className="mt-2 text-title-1 font-semibold tracking-[-0.03em]">Konsol petugas</p>
                  <p className="mt-2 text-body text-white/80">Periksa sinyal, minta klarifikasi, lalu putuskan.</p>
                </div>
                <Arrow dark />
              </div>
              <p className="relative mt-8 text-body-sm text-white/70">AI menyarankan. Petugas memutuskan.</p>
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line bg-paper py-12 text-ink-soft">
      <div className={`${WRAP} grid gap-8 md:grid-cols-[minmax(0,1fr)_auto]`}>
        <div className="max-w-2xl">
          <SehatiLogo size={24} />
          <p className="mt-5 text-body-sm">
            Prototipe Healthkathon 2026. Seluruh data sintetis. SEHATI bukan produk resmi BPJS Kesehatan dan tidak terhubung langsung. AI hanya menyarankan; tidak ada pembayaran, koreksi klaim, atau sanksi otomatis.
          </p>
          <p className="mt-3 text-body-sm">
            <a href="/media/CREDITS.md" className="underline decoration-line-strong underline-offset-4 hover:text-ink">
              Video: Mixkit · Foto: Unsplash
            </a>
          </p>
        </div>
        <nav aria-label="Pintu demo" className="flex flex-col gap-1 text-body font-medium md:items-end">
          <Link href="/m" className="flex min-h-11 items-center hover:text-ink">Aplikasi peserta</Link>
          <Link href="/faskes" className="flex min-h-11 items-center hover:text-ink">Portal faskes</Link>
          <Link href="/console" className="flex min-h-11 items-center hover:text-ink">Konsol petugas</Link>
        </nav>
      </div>
    </footer>
  );
}
