"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

/* Komponen penjelas: membuat setiap kode & istilah bisa "ditanya" tanpa meninggalkan halaman.
   - <Term k="phantom">phantom billing</Term>   → teks bergaris titik-titik, klik/arahkan untuk penjelasan
   - <CodeTag k="kasus">KS-0003</CodeTag>         → kode monospace + ikon ⓘ dengan penjelasan
   - <InfoDot k="skor" />                          → ikon ⓘ saja (untuk judul kolom/label)
   - <PageGuide id="antrean" ... />                → panel "Cara membaca halaman ini" yang bisa dilipat */

const EASE = [0.22, 1, 0.36, 1] as const;

function usePopover() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const hoverT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const place = useCallback(() => {
    const el = anchor.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const W = 300;
    const left = Math.min(Math.max(12, r.left + r.width / 2 - W / 2), window.innerWidth - W - 12);
    const above = r.bottom + 180 > window.innerHeight && r.top > 200;
    setPos({ top: above ? r.top - 8 : r.bottom + 8, left, above });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const on = () => place();
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const down = (e: MouseEvent) => {
      if (anchor.current && !anchor.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-popover]")) setOpen(false);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", down);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", down);
    };
  }, [open]);

  const hover = {
    onMouseEnter: () => {
      if (hoverT.current) clearTimeout(hoverT.current);
      hoverT.current = setTimeout(() => setOpen(true), 120);
    },
    onMouseLeave: () => {
      if (hoverT.current) clearTimeout(hoverT.current);
      hoverT.current = setTimeout(() => setOpen(false), 150);
    },
  };
  return { open, setOpen, pos, anchor, hover };
}

function Bubble({ k, open, pos, id, hover }: { k: GlossaryKey; open: boolean; pos: { top: number; left: number; above: boolean } | null; id: string; hover: { onMouseEnter: () => void; onMouseLeave: () => void } }) {
  const g = GLOSSARY[k];
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && pos && (
        <motion.div
          data-popover
          id={id}
          role="tooltip"
          {...hover}
          initial={{ opacity: 0, y: pos.above ? 6 : -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          transition={{ duration: 0.18, ease: EASE }}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 300, zIndex: 100 }}
          className="pointer-events-auto"
        >
          <div className={`rounded-xl bg-ink p-4 text-left text-white shadow-depth-3 ring-1 ring-white/10 ${pos.above ? "-translate-y-full" : ""}`}>
            <p className="eyebrow text-mint">Apa ini?</p>
            <p className="mt-1 font-display text-[15px] font-bold leading-snug">{g.title}</p>
            <p className="mt-1.5 text-[13px] font-normal leading-relaxed text-white/85">{g.body}</p>
            {"example" in g && g.example && (
              <p className="mt-2 text-[12px] text-white/60">
                Contoh: <span className="font-mono text-gold-1">{g.example}</span>
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Istilah dengan penjelasan: garis bawah titik-titik, klik atau arahkan kursor. */
export function Term({ k, children, className = "" }: { k: GlossaryKey; children: ReactNode; className?: string }) {
  const { open, setOpen, pos, anchor, hover } = usePopover();
  const id = useId();
  return (
    <>
      <button
        ref={(el) => {
          anchor.current = el;
        }}
        type="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        {...hover}
        className={`inline cursor-help border-b border-dotted border-current/60 text-inherit [font:inherit] hover:border-solid ${className}`}
      >
        {children}
      </button>
      <Bubble k={k} open={open} pos={pos} id={id} hover={hover} />
    </>
  );
}

/** Ikon ⓘ kecil dengan penjelasan istilah. */
export function InfoDot({ k, className = "", label }: { k: GlossaryKey; className?: string; label?: string }) {
  const { open, setOpen, pos, anchor, hover } = usePopover();
  const id = useId();
  return (
    <>
      <button
        ref={(el) => {
          anchor.current = el;
        }}
        type="button"
        aria-label={label ?? `Penjelasan: ${GLOSSARY[k].title}`}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        {...hover}
        className={`inline-grid h-4 w-4 shrink-0 cursor-help place-items-center rounded-full bg-current/10 align-[-2px] text-[10px] font-bold normal-case tracking-normal opacity-70 transition hover:opacity-100 ${className}`}
      >
        <span aria-hidden>i</span>
      </button>
      <Bubble k={k} open={open} pos={pos} id={id} hover={hover} />
    </>
  );
}

/** Kode (nomor kasus/klaim/layanan) dengan ikon penjelasan. */
export function CodeTag({ k, children, className = "" }: { k: GlossaryKey; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[0.85em] font-semibold ${className}`}>
      {children}
      <InfoDot k={k} />
    </span>
  );
}

export interface GuideStep {
  title: string;
  body: ReactNode;
}

/** Panel "Cara membaca halaman ini". Terbuka saat pertama kali, lalu ingat pilihan pengguna. */
export function PageGuide({ id, title = "Cara membaca halaman ini", intro, steps, legend, tone = "light" }: { id: string; title?: string; intro?: ReactNode; steps: GuideStep[]; legend?: ReactNode; tone?: "light" | "dark" }) {
  const key = `sehati-guide-${id}`;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(key) === "0") setOpen(false);
    } catch {}
  }, [key]);
  function toggle() {
    setOpen((o) => {
      try {
        localStorage.setItem(key, o ? "0" : "1");
      } catch {}
      return !o;
    });
  }
  const dark = tone === "dark";
  return (
    <section
      aria-label={title}
      className={`no-print relative mb-5 overflow-hidden rounded-xl border ${dark ? "border-white/10 bg-ink text-white" : "border-line bg-card"}`}
    >
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-3.5 text-left">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-bold ${dark ? "bg-white/10 text-mint" : "bg-brand-soft text-brand"}`} aria-hidden>
          ?
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[15px] font-bold">{title}</span>
          {!open && <span className={`block truncate text-xs ${dark ? "text-white/70" : "text-muted"}`}>Klik untuk melihat panduan singkat</span>}
        </span>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${dark ? "bg-white/10" : "bg-paper text-ink-soft"}`}>{open ? "Sembunyikan" : "Tampilkan"}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }} className="overflow-hidden">
            <div className="px-5 pb-5">
              {intro && <p className={`max-w-3xl text-sm leading-relaxed ${dark ? "text-white/85" : "text-ink-soft"}`}>{intro}</p>}
              <ol className={`mt-4 grid gap-3 ${steps.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : steps.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                {steps.map((s, i) => (
                  <li key={i} className={`rounded-lg p-3.5 ${dark ? "bg-white/5 ring-1 ring-white/10" : "bg-paper ring-1 ring-line"}`}>
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-[11px] font-semibold text-white">{i + 1}</span>
                      <p className="font-display text-sm font-bold">{s.title}</p>
                    </div>
                    <div className={`mt-1.5 text-[13px] leading-relaxed ${dark ? "text-white/80" : "text-ink-soft"}`}>{s.body}</div>
                  </li>
                ))}
              </ol>
              {legend && <div className={`mt-4 border-t pt-3 text-xs ${dark ? "border-white/10 text-white/75" : "border-line text-ink-soft"}`}>{legend}</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
