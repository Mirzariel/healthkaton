"use client";

import { animate, motion, useInView, useReducedMotion, useTransform, type MotionValue } from "framer-motion";
import Image from "next/image";
import { useEffect, useRef, type ReactNode } from "react";

/* Primitif bersama halaman cerita. Gaya: gading + tinta hitam, satu aksen hijau, garis rambut, tanpa dekorasi. */

export const EP = 66; // lebar masa rawat (persen) pada diagram tagihan
export const EASE = [0.22, 1, 0.36, 1] as const;

/** Tombol pil gaya Tesla: satu solid, satu bergaris. */
export const BTN = "inline-flex min-w-40 items-center justify-center gap-2 rounded-full px-7 py-3 text-sm font-medium transition-colors duration-150 active:scale-[0.98]";
export const BTN_PRIMARY = `${BTN} bg-ink text-white hover:bg-[#2a2e2c]`;
export const BTN_PRIMARY_DARK = `${BTN} bg-white text-ink hover:bg-white/85`;
export const BTN_LINE = `${BTN} border border-ink/30 text-ink hover:border-ink`;
export const BTN_LINE_DARK = `${BTN} border border-white/35 text-white hover:border-white`;
/** Tautan teks gaya Apple: "Coba sebagai peserta ›". */
export const TLINK = "inline-flex items-center gap-1 text-[17px] font-medium underline-offset-4 hover:underline";

/** Muncul sederhana: pudar + geser tipis. */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Kepala bagian terpusat: label mono, judul besar, satu kalimat penjelas, lalu tautan/tombol. */
export function Head({ n, kicker, title, sub, dark = false, children }: { n?: number; kicker: string; title: ReactNode; sub?: ReactNode; dark?: boolean; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl text-center">
      <Reveal>
        <p className={`eyebrow ${dark ? "text-white/60" : "text-muted"}`}>
          {n !== undefined && <span>{String(n).padStart(2, "0")} — </span>}
          {kicker}
        </p>
      </Reveal>
      <Reveal delay={0.05}>
        <h2 className={`mt-5 text-balance text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl ${dark ? "text-white" : "text-ink"}`}>{title}</h2>
      </Reveal>
      {sub && (
        <Reveal delay={0.1}>
          <p className={`mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed sm:text-xl ${dark ? "text-white/70" : "text-ink-soft"}`}>{sub}</p>
        </Reveal>
      )}
      {children && (
        <Reveal delay={0.15} className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {children}
        </Reveal>
      )}
    </div>
  );
}

type Tone = "paper" | "white" | "dark";
const TONE: Record<Tone, string> = {
  paper: "bg-paper text-ink border-line",
  white: "bg-white text-ink border-line",
  dark: "bg-ink text-white border-white/10",
};

/** Bagian layar penuh: satu gagasan per layar. Foto latar opsional (gelap, abu-abu). */
export function Section({
  id,
  tone,
  children,
  className = "",
  screen = false,
  bg,
}: {
  id?: string;
  tone: Tone;
  children: ReactNode;
  className?: string;
  screen?: boolean;
  bg?: { src: string; alt: string; position?: string };
}) {
  return (
    <section id={id} className={`relative overflow-hidden border-t px-4 py-24 sm:px-6 sm:py-32 ${screen ? "flex min-h-[100svh] items-center" : ""} ${id ? "scroll-mt-12" : ""} ${TONE[tone]} ${className}`}>
      {bg && (
        <>
          <Image src={bg.src} alt={bg.alt} fill sizes="100vw" className="object-cover opacity-45 grayscale" style={{ objectPosition: bg.position ?? "center" }} />
          <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/55 to-ink/90" aria-hidden />
        </>
      )}
      <div className="relative mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}

/** Angka naik sekali saat terlihat. Teks akhir sudah ada di HTML, jadi tanpa gerak tetap benar. */
export function CountUp({ value, from = 0, delay = 0, className = "" }: { value: string; from?: number; delay?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduce = useReducedMotion();
  useEffect(() => {
    const m = /^(\D*)(\d+)(?:([.,])(\d+))?(\D*)$/.exec(value);
    const el = ref.current;
    if (!inView || reduce || !m || !el) return;
    const [, pre, int, sep = ".", dec = "", post] = m;
    const to = parseFloat(`${int}.${dec || "0"}`);
    const fmt = (v: number) => pre + v.toFixed(dec.length).replace(".", sep) + post;
    el.textContent = fmt(from);
    const c = animate(from, to, {
      duration: 1,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = fmt(v);
      },
      onComplete: () => {
        el.textContent = value;
      },
    });
    return () => c.stop();
  }, [inView, reduce, value, from, delay]);
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {value}
    </span>
  );
}

/** Simpul garis waktu menyala saat garis mencapainya. */
export function TimelineNode({ progress, at, flagged }: { progress: MotionValue<number>; at: number; flagged: boolean }) {
  const bg = useTransform(progress, [Math.max(0, at - 0.04), at], ["#e3e1da", flagged ? "#c8323a" : "#0b0d0c"]);
  return <motion.span style={{ backgroundColor: bg }} className="absolute left-0 top-0 h-7 w-7 rounded-full border-[6px] border-white" aria-hidden />;
}

/** Jumlah rupiah dari teks seperti "Rp8.900.000". */
export function sumRupiah(amounts: string[]): string {
  const total = amounts.reduce((s, a) => s + (parseInt(a.replace(/\D/g, ""), 10) || 0), 0);
  return "Rp" + String(total).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/* ---------- Ikon garis sederhana ---------- */

const ico = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const IconEye = () => (
  <svg {...ico}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const IconColumns = () => (
  <svg {...ico}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M12 4v16M6.5 9h2M6.5 13h2M15.5 9h2M15.5 13h2" />
  </svg>
);
export const IconChain = () => (
  <svg {...ico}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 10 18.7l1-1" />
  </svg>
);
export const IconArrow = () => (
  <svg {...ico} width={16} height={16}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const IconScale = () => (
  <svg {...ico}>
    <path d="M12 4v16M7 20h10M5 8h14" />
    <path d="m5 8-2.5 6a3 3 0 0 0 5 0L5 8ZM19 8l-2.5 6a3 3 0 0 0 5 0L19 8Z" />
  </svg>
);
export const IconFlask = () => (
  <svg {...ico}>
    <path d="M9 3h6M10 3v6L4.8 18a2 2 0 0 0 1.8 3h10.8a2 2 0 0 0 1.8-3L14 9V3" />
    <path d="M7.5 14h9" />
  </svg>
);
export const IconPlug = () => (
  <svg {...ico}>
    <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v4" />
  </svg>
);
