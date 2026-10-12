"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import { IconX } from "./icons";

/* Perkakas tampilan khusus aplikasi peserta. Semua ukuran teks memakai em agar mengikuti pengaturan A / A+ / A++.
   Target sentuh minimal 48px untuk tombol utama dan 44px untuk tombol sekunder. */

const base = "inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-center font-semibold leading-tight transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";

export const BTN = {
  primary: `${base} min-h-12 bg-brand text-white hover:bg-brand-hover`,
  secondary: `${base} min-h-12 border border-line-strong bg-card text-ink hover:bg-subtle`,
  outline: `${base} min-h-12 border border-brand/40 bg-card text-brand-ink hover:bg-brand-tint`,
  ghost: `${base} min-h-11 text-ink-soft hover:bg-subtle hover:text-ink`,
  danger: `${base} min-h-12 border border-danger/35 bg-card text-danger hover:bg-danger-soft`,
} as const;

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Lencana kecil: teks biasa, bukan huruf kapital. */
export function Tag({ children, tone = "muted", className = "" }: { children: ReactNode; tone?: "muted" | "brand" | "ok" | "warn" | "info"; className?: string }) {
  const t = {
    muted: "bg-subtle text-ink-soft ring-line",
    brand: "bg-brand-soft text-brand-ink ring-brand/15",
    ok: "bg-ok-soft text-ok ring-ok/20",
    warn: "bg-warn-soft text-warn ring-warn/25",
    info: "bg-info-soft text-info ring-info/20",
  }[tone];
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[0.75em] font-semibold leading-snug ring-1 ring-inset ${t} ${className}`}>{children}</span>;
}

/** Pesan sebaris dengan ikon (info, peringatan, galat). */
export function Callout({ tone = "neutral", icon, children, role, className = "" }: { tone?: "neutral" | "brand" | "warn" | "danger" | "ok"; icon?: ReactNode; children: ReactNode; role?: "alert" | "status"; className?: string }) {
  const t = {
    neutral: "border-line bg-subtle/70 text-ink-soft",
    brand: "border-brand/15 bg-brand-tint text-ink-soft",
    warn: "border-warn/25 bg-warn-soft text-ink",
    danger: "border-danger/30 bg-danger-soft text-danger",
    ok: "border-ok/20 bg-ok-soft text-ink",
  }[tone];
  return (
    <div role={role} className={`flex gap-2.5 rounded-xl border px-3.5 py-3 text-[0.85em] leading-snug ${t} ${className}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-2 overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Lembar bawah di dalam bingkai ponsel: Esc menutup, fokus dikunci di dalamnya, fokus kembali ke pemicu. */
export function Sheet({ title, titleId, onClose, children }: { title: string; titleId: string; onClose: () => void; children: ReactNode }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const f = [...ref.current.querySelectorAll<HTMLElement>("button, select, textarea, input, a[href], [tabindex]:not([tabindex='-1'])")].filter((el) => !el.hasAttribute("disabled"));
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prev?.focus?.({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      <motion.button type="button" aria-label="Tutup" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-ink/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative max-h-[88%] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-line bg-card px-4 pb-5 pt-2 shadow-depth-3 outline-none"
        initial={{ y: reduce ? 0 : 48, opacity: reduce ? 0 : 1 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: reduce ? 0 : 48, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mx-auto mb-1 h-1 w-9 rounded-full bg-line-strong" aria-hidden />
        <div className="flex items-center justify-between gap-2">
          <h2 id={titleId} className="text-[1.15em] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="grid size-11 place-items-center rounded-xl text-ink-soft hover:bg-subtle">
            <IconX size={20} />
          </button>
        </div>
        <div className="mt-1 space-y-3">{children}</div>
      </motion.div>
    </div>
  );
}
