"use client";

import { MotionConfig, animate, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Semua gerak mengikuti preferensi "kurangi gerak" pengguna. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

const EASE = [0.22, 1, 0.36, 1] as const;

/* Animasi masuk hanya pada pemuatan pertama; perpindahan filter/halaman tidak mengulang. */
let played = false;
function usePlayedOnce() {
  const first = useRef(!played);
  useEffect(() => {
    const t = setTimeout(() => {
      played = true;
    }, 900);
    return () => clearTimeout(t);
  }, []);
  return first.current;
}

type RowProps = { index: number; className?: string; children: ReactNode };

/** Baris tabel: muncul berurutan (maks. 12 baris pertama).
 *  Keadaan awal tidak pernah sepenuhnya transparan (0.35): HTML dari server tampil jelas sebelum JavaScript
 *  aktif, dan di tab latar (animasi tertahan) daftar tidak tampak kosong. */
export function MotionRow({ index, className, children }: RowProps) {
  const first = usePlayedOnce();
  return (
    <motion.tr
      className={className}
      initial={first ? { opacity: 0.35, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE, delay: Math.min(index, 12) * 0.025 }}
    >
      {children}
    </motion.tr>
  );
}

export function MotionItem({ index, className, children }: RowProps) {
  const first = usePlayedOnce();
  return (
    <motion.div
      className={className}
      initial={first ? { opacity: 0.35, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE, delay: Math.min(index, 12) * 0.03 }}
    >
      {children}
    </motion.div>
  );
}

/** Angka naik sekali per sesi agar KPI terasa "hidup" tanpa mengganggu. */
export function CountUp({ value, kind = "int" }: { value: number; kind?: "int" | "pct" | "dec1" | "rpShort" }) {
  const fmt = (n: number) => {
    if (kind === "pct") return `${Math.round(n)}%`;
    if (kind === "dec1") return n.toFixed(1).replace(".", ",");
    if (kind === "rpShort") {
      if (n >= 1e9) return "Rp" + (n / 1e9).toFixed(1).replace(".", ",") + " M";
      if (n >= 1e6) return "Rp" + (n / 1e6).toFixed(1).replace(".", ",") + " jt";
      return "Rp" + Math.round(n).toLocaleString("id-ID");
    }
    return Math.round(n).toLocaleString("id-ID");
  };
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const final = kind === "pct" ? value * 100 : value;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem("sehati_kpi") === "1";
    } catch {}
    if (reduce || seen || final === 0) {
      el.textContent = fmt(final);
      return;
    }
    const c = animate(0, final, { duration: 0.8, ease: EASE, onUpdate: (v) => (el.textContent = fmt(v)) });
    try {
      sessionStorage.setItem("sehati_kpi", "1");
    } catch {}
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [final, kind, reduce]);
  return (
    <span ref={ref} aria-label={fmt(final)}>
      {fmt(final)}
    </span>
  );
}

/** Bar skor terisi dari kiri (tanpa mengubah tata letak). */
export function ScoreBar({ pct, className }: { pct: number; className: string }) {
  return (
    <motion.div
      className={`h-full w-full origin-left rounded-full ${className}`}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: Math.max(0.03, Math.min(1, pct / 100)) }}
      transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
    />
  );
}

/** Kartu tahap muncul berurutan; titik status "memantul" saat status berubah. */
export function StageItem({ index, className, children }: { index: number; className?: string; children: ReactNode }) {
  return (
    <motion.li
      className={className}
      initial={{ opacity: 0.35, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE, delay: index * 0.06 }}
    >
      {children}
    </motion.li>
  );
}

export function StageDot({ status, index, className, children }: { status: string; index: number; className: string; children: ReactNode }) {
  return (
    <motion.span
      data-status={status}
      className={className}
      aria-hidden
      initial={{ scale: 0.5 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 18, delay: 0.1 + index * 0.06 }}
    >
      {children}
    </motion.span>
  );
}

/** Sorot singkat pada judul halaman saat peran diganti. */
export function flashHeading() {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const el = document.querySelector<HTMLElement>("#main h1");
  el?.animate([{ backgroundColor: "rgba(11,93,87,0.18)" }, { backgroundColor: "rgba(11,93,87,0)" }], { duration: 700, easing: "ease-out" });
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function CheckMark({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <motion.path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.25, ease: EASE }}
      />
    </svg>
  );
}

/** Pesan umpan balik: masuk halus, hilang sendiri setelah beberapa detik (kecuali galat). */
export function useFlash(ms = 4000) {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), ms);
    return () => clearTimeout(t);
  }, [msg, ms]);
  return [msg, setMsg] as const;
}

export { motion };
export { AnimatePresence } from "framer-motion";
