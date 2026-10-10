"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { InfoDot } from "@/components/explain";
import type { NavItem } from "@/lib/nav";

export interface PersonaOption {
  userId: string;
  label: string;
  roleLabel: string;
  hint: string;
  current: boolean;
}

export function PersonaSwitcher({ options, tone = "light" }: { options: PersonaOption[]; tone?: "light" | "dark" }) {
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
  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="persona" className={`flex items-center gap-1.5 text-xs font-medium ${tone === "dark" ? "text-white/70" : "text-ink-soft"}`}>
        Peran demo <InfoDot k="peranDemo" />
      </label>
      <select
        id="persona"
        value={cur.userId}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        className="max-w-[16rem] rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm font-medium text-ink outline-offset-2"
        title={cur.hint}
      >
        {options.map((o) => (
          <option key={o.userId} value={o.userId}>
            {o.roleLabel}: {o.label}
          </option>
        ))}
      </select>
      {err && <span role="alert" className="text-xs text-danger">{err}</span>}
    </div>
  );
}

export function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <nav aria-label="Menu konsol" className="space-y-5">
      {groups.map((g) => (
        <div key={g}>
          <p className="eyebrow px-2 text-[10px] text-white/40">{g}</p>
          <ul className="mt-1.5 space-y-0.5">
            {items.filter((i) => i.group === g).map((i) => {
              const active = i.href === "/console" ? path === "/console" : path === i.href || path.startsWith(i.href + "/");
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${active ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/8 hover:text-white"}`}
                  >
                    {i.label}
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

export function MobileMenu({ items, children }: { items: NavItem[]; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((v) => !v)} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold">
        Menu
      </button>
      {open && (
        <div id="mobile-menu" className="fixed inset-0 z-50 bg-ink/95 p-5 text-white" role="dialog" aria-modal="true" aria-label="Menu konsol">
          <button type="button" onClick={() => setOpen(false)} className="mb-4 rounded-lg border border-white/30 px-3 py-1.5 text-sm font-semibold">
            Tutup
          </button>
          <NavLinks items={items} onNavigate={() => setOpen(false)} />
          <div className="mt-6">{children}</div>
        </div>
      )}
    </>
  );
}

export function ResetDemoButton() {
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
      <button type="button" onClick={go} disabled={busy} className="w-full rounded-lg border border-white/25 px-3 py-2 text-left text-xs font-semibold text-white/80 hover:bg-white/8 disabled:opacity-50">
        {busy ? "Mengatur ulang…" : "Atur ulang data demo"}
      </button>
      {msg && <p role="status" className="mt-1 text-xs text-white/70">{msg}</p>}
    </div>
  );
}
