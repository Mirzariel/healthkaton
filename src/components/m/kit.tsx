"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { IconArrowLeft, IconArrowRight, IconChevronRight, IconX } from "./icons";

/* Perkakas tampilan khusus aplikasi peserta. Semua ukuran teks memakai em agar mengikuti pengaturan A / A+ / A++.
   Prinsip: satu tugas per layar, tanpa gulir. Daftar panjang dipecah menjadi halaman (AutoPager), bukan digulir.
   Target sentuh minimal 56px untuk tombol utama dan 48px untuk tombol sekunder. */

export const EASE = [0.22, 1, 0.36, 1] as const;

const base = "inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-center font-semibold leading-tight transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100";

export const BTN = {
  primary: `${base} min-h-14 bg-brand text-white shadow-e2 hover:bg-brand-hover`,
  secondary: `${base} min-h-14 border border-line-strong bg-card text-ink shadow-e1 hover:bg-subtle`,
  outline: `${base} min-h-14 border-2 border-brand/50 bg-card text-brand-ink hover:bg-brand-tint`,
  ghost: `${base} min-h-12 text-ink hover:bg-subtle`,
  danger: `${base} min-h-14 border border-danger/35 bg-card text-danger hover:bg-danger-soft`,
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
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[0.82em] font-semibold leading-snug ring-1 ring-inset ${t} ${className}`}>{children}</span>;
}

/** Pesan sebaris dengan ikon (info, peringatan, galat). */
export function Callout({ tone = "neutral", icon, children, role, className = "" }: { tone?: "neutral" | "brand" | "warn" | "danger" | "ok"; icon?: ReactNode; children: ReactNode; role?: "alert" | "status"; className?: string }) {
  const t = {
    neutral: "border-line bg-card text-ink-soft",
    brand: "border-brand/15 bg-brand-tint text-ink",
    warn: "border-warn/25 bg-warn-soft text-ink",
    danger: "border-danger/30 bg-danger-soft text-danger",
    ok: "border-ok/20 bg-ok-soft text-ink",
  }[tone];
  return (
    <div role={role} className={`flex shrink-0 gap-2.5 rounded-2xl border px-3.5 py-3 text-[0.9em] leading-snug ${t} ${className}`}>
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

/**
 * Tingkat kepadatan adaptif: mulai dari 0 (lapang); selama predikat "terlalu sesak" benar, naik satu tingkat
 * (tata letak lebih ringkas) hingga max. Dihitung ulang saat ukuran wadah atau isi (deps) berubah.
 */
export const TextSizeCtx = createContext(1);

export function useFitLevel(ref: React.RefObject<HTMLElement | null>, max: number, tight: (el: HTMLElement) => boolean, deps: unknown[]) {
  const [level, setLevel] = useState(0);
  const [tick, setTick] = useState(0);
  const size = useContext(TextSizeCtx);
  const sig = JSON.stringify([size, ...deps]);
  useLayoutEffect(() => {
    setLevel(0);
  }, [sig, tick]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && level < max && tight(el)) setLevel((l) => Math.min(max, l + 1));
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let w = el.clientWidth;
    let h = el.clientHeight;
    const ro = new ResizeObserver(() => {
      if (!ref.current) return;
      if (Math.abs(ref.current.clientWidth - w) > 1 || Math.abs(ref.current.clientHeight - h) > 1) {
        w = ref.current.clientWidth;
        h = ref.current.clientHeight;
        setTick((t) => t + 1);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return level;
}

export const overflows = (el: HTMLElement) => el.scrollHeight > el.clientHeight + 1;

/** Judul layar. Bila onBack ada, tampil tombol "Kembali" berlabel (bukan ikon saja). */
export function ScreenTitle({ title, onBack, backLabel = "Kembali", aside, sub }: { title: ReactNode; onBack?: () => void; backLabel?: string; aside?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="shrink-0 space-y-1.5">
      {onBack && (
        <button type="button" onClick={onBack} className="-ml-2 inline-flex min-h-12 items-center gap-1.5 rounded-xl px-2 text-[0.95em] font-semibold text-brand-ink hover:bg-brand-tint">
          <IconArrowLeft size={22} /> {backLabel}
        </button>
      )}
      <div className="flex items-end justify-between gap-3">
        <h1 className="min-w-0 text-[1.45em] font-semibold leading-tight tracking-tight">{title}</h1>
        {aside}
      </div>
      {sub && <p className="text-[0.95em] leading-snug text-ink-soft">{sub}</p>}
    </div>
  );
}

/** Baris tautan ringkas: "Perawatan saya · 2 ›". */
export function RowLink({ icon, label, count, onClick, hint }: { icon: ReactNode; label: string; count?: number; onClick: () => void; hint?: string }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-16 w-full shrink-0 items-center gap-3 rounded-2xl bg-card px-4 py-2.5 text-left shadow-e1 transition-colors duration-150 hover:bg-brand-tint active:scale-[0.99]">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-subtle text-ink-soft">{icon}</span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block text-[0.85em] text-ink-soft">{hint}</span>}
      </span>
      {count !== undefined && <span className="grid h-8 min-w-8 place-items-center rounded-full bg-subtle px-2 text-[0.9em] font-semibold tabular-nums text-ink">{count}</span>}
      <IconChevronRight size={22} className="shrink-0 text-ink-soft" />
    </button>
  );
}

/** Layar konfirmasi tenang: ikon centang besar, judul, isi singkat. */
export function Done({ title, children, action }: { title: string; children?: ReactNode; action: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
        <motion.span
          aria-hidden
          className="grid size-20 shrink-0 place-items-center rounded-full bg-ok-soft text-ok shadow-e1"
          initial={{ scale: reduce ? 1 : 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: EASE }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.15, ease: EASE }} />
          </svg>
        </motion.span>
        <h2 className="text-[1.4em] font-semibold leading-tight tracking-tight">{title}</h2>
        {children && <div className="max-w-[22em] space-y-2 text-[0.98em] leading-snug text-ink-soft">{children}</div>}
      </div>
      <div className="shrink-0 pt-3">{action}</div>
    </div>
  );
}

function PagerControls({ page, total, onPrev, onNext, label }: { page: number; total: number; onPrev?: () => void; onNext?: () => void; label: string }) {
  return (
    <nav aria-label={label} className="space-y-1.5">
      <p className="text-center text-[0.9em] font-semibold tabular-nums text-ink-soft" aria-live="polite">
        {page + 1} dari {total}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onPrev} disabled={page === 0} className={`${BTN.secondary} px-2 text-[0.92em]`}>
          <IconArrowLeft size={20} className="shrink-0" /> Sebelumnya
        </button>
        <button type="button" onClick={onNext} disabled={page >= total - 1} className={`${BTN.secondary} px-2 text-[0.92em]`}>
          Berikutnya <IconArrowRight size={20} className="shrink-0" />
        </button>
      </div>
    </nav>
  );
}

/**
 * Daftar berhalaman otomatis. Mengukur tinggi setiap butir dan ruang yang tersedia, lalu membagi butir ke halaman
 * sehingga tiap halaman pas di layar tanpa gulir. Ukuran huruf lebih besar = lebih banyak halaman, bukan gulir.
 */
export function AutoPager({ items, label = "Halaman daftar", resetKey }: { items: { key: string; node: ReactNode }[]; label?: string; resetKey?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const ctrl = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][]>(() => [items.map((_, i) => i)]);
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState(1);
  const reduce = useReducedMotion();
  const sig = items.map((i) => i.key).join("|");

  const measure = useCallback(() => {
    const b = box.current;
    const l = layer.current;
    const c = ctrl.current;
    if (!b || !l || !c) return;
    const H = b.clientHeight;
    const gap = list.current ? parseFloat(getComputedStyle(list.current).rowGap) || 0 : 12;
    const hs = [...l.querySelectorAll<HTMLElement>(":scope > [data-pi]")].map((e) => e.getBoundingClientRect().height);
    const total = hs.reduce((a, h) => a + h, 0) + gap * Math.max(0, hs.length - 1);
    let next: number[][];
    if (H <= 0 || total <= H + 0.5) next = [hs.map((_, i) => i)];
    else {
      const avail = H - c.getBoundingClientRect().height - gap;
      next = [];
      let cur: number[] = [];
      let used = 0;
      hs.forEach((h, i) => {
        const add = (cur.length ? gap : 0) + h;
        if (cur.length && used + add > avail + 0.5) {
          next.push(cur);
          cur = [i];
          used = h;
        } else {
          cur.push(i);
          used += add;
        }
      });
      if (cur.length) next.push(cur);
    }
    setPages((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, sig]);
  useEffect(() => {
    const ro = new ResizeObserver(() => measure());
    if (box.current) ro.observe(box.current);
    layer.current?.querySelectorAll(":scope > div").forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [measure, sig]);
  useEffect(() => {
    setPage(0);
  }, [resetKey]);

  const pi = Math.min(page, Math.max(0, pages.length - 1));
  const shown = (pages[pi] ?? []).filter((i) => i < items.length);
  const go = (d: number) => {
    setDir(d);
    setPage(Math.max(0, Math.min(pages.length - 1, pi + d)));
  };

  return (
    <div ref={box} className="relative flex min-h-0 flex-1 flex-col">
      {/* Lapisan ukur: tak terlihat, tak dapat difokus, tidak menambah tinggi gulir. */}
      <div ref={layer} aria-hidden inert className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
        {items.map((it) => (
          <div key={it.key} data-pi="">
            {it.node}
          </div>
        ))}
        <div ref={ctrl}>
          <PagerControls page={0} total={2} label="" />
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={pi}
            ref={list}
            className="flex flex-col gap-[0.7em]"
            custom={dir}
            initial={{ opacity: 0, x: reduce ? 0 : dir * 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduce ? 0 : dir * -28 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            {shown.map((i) => (
              <div key={items[i].key} className="shrink-0">
                {items[i].node}
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
      {pages.length > 1 && (
        <div className="shrink-0 pt-[0.7em]">
          <PagerControls page={pi} total={pages.length} onPrev={() => go(-1)} onNext={() => go(1)} label={label} />
        </div>
      )}
    </div>
  );
}

/** Lembar bawah di dalam aplikasi: Esc menutup, fokus dikunci di dalamnya, fokus kembali ke pemicu. */
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
      const f = [...ref.current.querySelectorAll<HTMLElement>("button, select, textarea, input, a[href], [tabindex]:not([tabindex='-1'])")].filter((el) => !el.hasAttribute("disabled") && !el.closest("[inert]"));
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
        className="relative flex max-h-[92%] flex-col rounded-t-[1.75rem] bg-card px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 shadow-e3 outline-none"
        initial={{ y: reduce ? 0 : 48, opacity: reduce ? 0 : 1 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: reduce ? 0 : 48, opacity: 0 }}
        transition={{ duration: 0.24, ease: EASE }}
      >
        <div className="mx-auto mb-1 h-1.5 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden />
        <div className="flex shrink-0 items-center justify-between gap-2">
          <h2 id={titleId} className="text-[1.25em] font-semibold leading-tight">{title}</h2>
          <button type="button" onClick={onClose} className="inline-flex min-h-12 items-center gap-1 rounded-xl px-2 font-semibold text-ink-soft hover:bg-subtle">
            <IconX size={20} /> Tutup
          </button>
        </div>
        <div className="mt-2 min-h-0 space-y-3 overflow-y-auto overscroll-contain no-scrollbar">{children}</div>
      </motion.div>
    </div>
  );
}

/** Lapisan layar penuh di dalam aplikasi (mis. "Jawaban saya", "Lihat percakapan"): judul + isi berhalaman. */
export function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prev?.focus?.({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className="absolute inset-0 z-20 flex flex-col bg-paper px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 outline-none"
      initial={{ opacity: 0, x: reduce ? 0 : 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: reduce ? 0 : 32 }}
      transition={{ duration: 0.22, ease: EASE }}
    >
      <ScreenTitle title={title} onBack={onClose} />
      <div className="mt-4 flex min-h-0 flex-1 flex-col">{children}</div>
    </motion.div>
  );
}
