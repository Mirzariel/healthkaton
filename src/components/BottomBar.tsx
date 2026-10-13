"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  IconBeaker, IconBook, IconCard, IconChart, IconChecklist, IconCpu, IconFile, IconFlag, IconHistory, IconHome, IconInbox, IconLayers, IconMenu, IconMessage, IconScale, IconSparkle, IconUpload, IconWallet, IconWrench, IconX,
} from "@/components/icons";

/* Bilah navigasi bawah untuk HP/tablet (< lg). Kaca buram, safe-area iOS, target sentuh ≥ 44px.
   Item terakhir selalu "Lainnya": membuka laci menu konsol (event) atau lembar bawah berisi `sheet`. */

type IconC = (p: { size?: number; className?: string }) => ReactNode;

/** Ikon berdasarkan nama (string agar bisa dikirim dari komponen server). */
export const BAR_ICON: Record<string, IconC> = {
  home: IconHome, inbox: IconInbox, sparkle: IconSparkle, checklist: IconChecklist, file: IconFile, layers: IconLayers, upload: IconUpload,
  book: IconBook, cpu: IconCpu, beaker: IconBeaker, chart: IconChart, card: IconCard, wallet: IconWallet, history: IconHistory,
  message: IconMessage, flag: IconFlag, wrench: IconWrench, scale: IconScale,
};

export interface BarItem {
  href: string;
  label: string;
  icon: keyof typeof BAR_ICON | string;
  /** Aktif hanya bila path sama persis (mis. halaman ringkasan). */
  exact?: boolean;
  /** Awalan path lain yang juga menandai item ini aktif. */
  also?: string[];
}

export const OPEN_MENU_EVENT = "sehati:open-menu";

/** Membuka laci menu konsol (MobileMenu) dari mana saja. */
export function openMobileMenu() {
  window.dispatchEvent(new Event(OPEN_MENU_EVENT));
}

function activeFor(path: string, it: BarItem) {
  const hit = it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/");
  return hit || !!it.also?.some((p) => path.startsWith(p));
}

const cell = "relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-control px-0.5 pt-1.5 pb-1 text-caption font-medium leading-tight tracking-tight transition-colors";

export function BottomBar({ items, sheet, sheetTitle = "Lainnya", label = "Navigasi utama" }: { items: BarItem[]; sheet?: ReactNode; sheetTitle?: string; label?: string }) {
  const path = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const anyActive = items.some((i) => activeFor(path, i));
  useEffect(() => setOpen(false), [path]);

  return (
    <>
      <nav aria-label={label} className="glass no-print fixed inset-x-0 bottom-0 z-40 border-t border-line pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto flex max-w-xl items-stretch gap-0.5 px-1.5 py-1">
          {items.map((it) => {
            const active = activeFor(path, it);
            const Icon = BAR_ICON[it.icon] ?? IconFile;
            return (
              <li key={it.href} className="flex min-w-0 flex-1">
                <Link href={it.href} aria-current={active ? "page" : undefined} className={`${cell} ${active ? "text-brand-ink" : "text-muted hover:text-ink"}`}>
                  <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${active ? "bg-brand-soft" : ""}`}>
                    <Icon size={19} />
                  </span>
                  <span className="max-w-full truncate">{it.label}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex min-w-0 flex-1">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={sheet ? open : undefined}
              onClick={() => (sheet ? setOpen(true) : openMobileMenu())}
              className={`${cell} ${!anyActive ? "text-brand-ink" : "text-muted hover:text-ink"}`}
            >
              <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${!anyActive ? "bg-brand-soft" : ""}`}>
                <IconMenu size={19} />
              </span>
              <span>Lainnya</span>
            </button>
          </li>
        </ul>
      </nav>
      {sheet && open && <BottomSheet title={sheetTitle} onClose={() => setOpen(false)}>{sheet}</BottomSheet>}
    </>
  );
}

/** Lembar bawah modal (dialog asli): Esc, klik latar, atau pindah halaman menutupnya. */
function BottomSheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = ref.current;
    const back = document.activeElement as HTMLElement | null;
    el?.showModal();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 1024px)");
    const resize = () => desktop.matches && close.current();
    desktop.addEventListener("change", resize);
    return () => {
      desktop.removeEventListener("change", resize);
      el?.close();
      document.body.style.overflow = prev;
      back?.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-0 backdrop:bg-ink/30 lg:hidden"
    >
      <button type="button" tabIndex={-1} aria-label="Tutup" className="absolute inset-0" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] animate-fade-in overflow-y-auto rounded-t-panel bg-card px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2 shadow-e3">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-body font-semibold text-ink">{title}</h2>
          <button type="button" autoFocus onClick={onClose} aria-label="Tutup" className="btn btn-ghost min-h-11 min-w-11 px-2">
            <IconX size={18} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Baris tautan untuk isi lembar "Lainnya". */
export function SheetLink({ href, label, icon, hint }: { href: string; label: string; icon: string; hint?: string }) {
  const path = usePathname() ?? "";
  const active = path === href || path.startsWith(href + "/");
  const Icon = BAR_ICON[icon] ?? IconFile;
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`flex min-h-12 items-center gap-3 rounded-control px-3 py-2 transition-colors ${active ? "bg-brand-soft text-brand-ink" : "text-ink hover:bg-subtle"}`}>
      <Icon size={18} className={active ? "text-brand" : "text-muted"} />
      <span className="min-w-0">
        <span className="block text-body-sm font-medium">{label}</span>
        {hint && <span className="block text-caption text-muted">{hint}</span>}
      </span>
    </Link>
  );
}
