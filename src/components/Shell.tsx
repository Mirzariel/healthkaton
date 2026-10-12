"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { InfoDot } from "@/components/explain";
import {
  IconBeaker, IconBook, IconCard, IconChart, IconChecklist, IconCpu, IconFile, IconHistory, IconHome, IconInbox, IconLayers, IconMenu, IconRefresh, IconSparkle, IconUpload, IconWallet, IconX,
} from "@/components/icons";
import type { NavItem } from "@/lib/nav";

export interface PersonaOption {
  userId: string;
  label: string;
  roleLabel: string;
  hint: string;
  current: boolean;
}

/** Pemilih peran khusus demo. Mengganti sesi lewat /api/session lalu menyegarkan halaman. */
export function PersonaSwitcher({ options, tone = "light", layout = "inline" }: { options: PersonaOption[]; tone?: "light" | "dark"; layout?: "inline" | "stacked" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const cur = options.find((o) => o.current) ?? options[0];
  if (!options.length) return null;
  async function change(userId: string) {
    setErr(null);
    const r = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }) });
    const j = await r.json();
    if (!j.ok) return setErr(j.error);
    start(() => router.refresh());
  }
  const stacked = layout === "stacked";
  return (
    <div className={stacked ? "space-y-1.5" : "flex min-w-0 max-w-full items-center gap-2"}>
      <label htmlFor="persona" className={`flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium ${tone === "dark" ? "text-white/70" : "text-muted"}`}>
        Peran demo <InfoDot k="peranDemo" />
      </label>
      <select
        id="persona"
        value={cur.userId}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        className={`h-8 rounded-lg border border-line-strong bg-card pl-2.5 pr-7 text-[13px] font-medium text-ink shadow-depth-1 disabled:opacity-60 ${stacked ? "w-full" : "min-w-0 max-w-[17rem] flex-1"}`}
        title={cur.hint}
      >
        {options.map((o) => (
          <option key={o.userId} value={o.userId}>
            {o.roleLabel}: {o.label}
          </option>
        ))}
      </select>
      {pending && <span role="status" className="sr-only">Mengganti peran…</span>}
      {err && <span role="alert" className="text-xs text-danger">{err}</span>}
    </div>
  );
}

const NAV_ICON: Record<string, (p: { size?: number; className?: string }) => ReactNode> = {
  "/console": IconHome,
  "/console/cases": IconInbox,
  "/console/assistant": IconSparkle,
  "/console/precheck": IconChecklist,
  "/console/documents": IconFile,
  "/console/pending": IconLayers,
  "/console/import": IconUpload,
  "/console/standards": IconBook,
  "/console/ai": IconCpu,
  "/console/ai/evaluation": IconBeaker,
  "/console/quality": IconChart,
  "/console/cards": IconCard,
  "/console/payments": IconWallet,
  "/console/audit": IconHistory,
};

function isActive(path: string, href: string, all: string[]) {
  if (href === "/console") return path === "/console";
  if (!(path === href || path.startsWith(href + "/"))) return false;
  // Rute yang lebih spesifik (mis. /console/ai/evaluation) menang atas induknya (/console/ai).
  return !all.some((h) => h !== href && h.startsWith(href + "/") && (path === h || path.startsWith(h + "/")));
}

export function NavLinks({ items, onNavigate, tone = "dark" }: { items: NavItem[]; onNavigate?: () => void; tone?: "light" | "dark" }) {
  const path = usePathname() ?? "";
  const groups = [...new Set(items.map((i) => i.group))];
  const hrefs = items.map((i) => i.href);
  return (
    <nav aria-label="Menu konsol" className="space-y-6">
      {groups.map((g) => (
        <div key={g}>
          <p className={`px-2.5 text-[11.5px] font-medium ${tone === "dark" ? "text-on-night-soft/70" : "text-muted"}`}>{g}</p>
          <ul className="mt-1.5 space-y-px">
            {items.filter((i) => i.group === g).map((i) => {
              const active = isActive(path, i.href, hrefs);
              const Icon = NAV_ICON[i.href] ?? IconFile;
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-colors duration-100 ${
                      tone === "dark"
                        ? active
                          ? "bg-white/[0.09] font-semibold text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]"
                          : "font-medium text-on-night-soft hover:bg-white/[0.05] hover:text-white"
                        : active
                          ? "bg-card font-semibold text-ink shadow-depth-1 ring-1 ring-line"
                          : "font-medium text-ink-soft hover:bg-ink/[0.045] hover:text-ink"
                    }`}
                  >
                    <Icon size={16} className={tone === "dark" ? (active ? "text-mint" : "text-on-night-soft/70 group-hover:text-white") : active ? "text-brand" : "text-muted group-hover:text-ink-soft"} />
                    <span className="truncate">{i.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Laci menu untuk layar kecil. Menutup dengan Esc, klik latar, atau saat berpindah halaman. */
export function MobileMenu({ items, children, brand }: { items: NavItem[]; children?: ReactNode; brand?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const el = dialog.current;
    el?.showModal();
    const desktop = window.matchMedia("(min-width: 1024px)");
    const resize = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", resize);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      desktop.removeEventListener("change", resize);
      el?.close();
      document.body.style.overflow = prev;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);
  return (
    <>
      <button ref={trigger} type="button" aria-expanded={open} aria-controls="mobile-menu" aria-label="Buka menu" onClick={() => setOpen(true)} className="btn btn-ghost min-h-11 min-w-11 -ml-2 px-2">
        <IconMenu size={20} />
      </button>
      {open && (
        <dialog ref={dialog} onCancel={(e) => { e.preventDefault(); setOpen(false); }} className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-0 text-on-night backdrop:bg-ink/30" aria-label="Menu konsol" id="mobile-menu">
          <button type="button" tabIndex={-1} aria-label="Tutup menu" className="absolute inset-0" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] animate-sheet-in flex-col overflow-y-auto bg-night px-3 pb-6 pt-3 text-on-night shadow-depth-3">
            <div className="mb-5 flex items-center justify-between px-1.5">
              {brand}
              <button type="button" autoFocus onClick={() => setOpen(false)} aria-label="Tutup menu" className="btn min-h-11 min-w-11 px-2 text-white hover:bg-white/10">
                <IconX size={18} />
              </button>
            </div>
            <NavLinks items={items} onNavigate={() => setOpen(false)} />
            <div className="mt-8 space-y-4 border-t border-white/10 px-1.5 pt-5">{children}</div>
          </div>
        </dialog>
      )}
    </>
  );
}

export function ResetDemoButton({ tone = "dark" }: { tone?: "light" | "dark" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function go() {
    if (!confirm("Atur ulang SELURUH data demo (termasuk jejak audit) ke kondisi awal? Hanya untuk data sintetis.")) return;
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/reset", { method: "POST" });
    const j = await r.json();
    setBusy(false);
    setMsg(j.ok ? "Data demo diatur ulang." : j.error);
    router.refresh();
  }
  return (
    <div>
      <button type="button" onClick={go} disabled={busy} className={`btn btn-sm w-full justify-start gap-2 px-2.5 text-[13px] ${tone === "dark" ? "text-on-night-soft hover:bg-white/[0.06] hover:text-white" : "btn-ghost text-ink-soft"}`}>
        <IconRefresh size={15} className="opacity-70" />
        {busy ? "Mengatur ulang…" : "Atur ulang data demo"}
      </button>
      {msg && <p role="status" className={`mt-1 px-2.5 text-xs ${tone === "dark" ? "text-on-night-soft" : "text-muted"}`}>{msg}</p>}
    </div>
  );
}

/** Inisial nama untuk avatar kecil. */
export function Avatar({ name, className = "" }: { name: string; className?: string }) {
  const ini = name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return (
    <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand-ink ring-1 ring-brand/10 ${className}`}>
      {ini}
    </span>
  );
}
