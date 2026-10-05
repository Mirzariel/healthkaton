"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { InfoDot, Term } from "@/components/explain";
import { IconChart, IconGavel, IconInbox, IconMenu, IconReset, IconScroll, IconShieldCheck, IconUpload, IconUser, IconX, IconArrow } from "@/components/console/icons";
import { AnimatePresence, flashHeading, motion } from "@/components/motion";
import type { GlossaryKey } from "@/lib/glossary";

type NavItem = { href: string; label: string; desc: string; icon: ReactNode; match: (p: string) => boolean; badge?: "antrean" };
const NAV: NavItem[] = [
  { href: "/console", label: "Antrean kasus", desc: "Klaim yang ditandai, urut dari yang paling mendesak", icon: <IconInbox />, match: (p) => p === "/console" || p.startsWith("/console/cases"), badge: "antrean" },
  { href: "/console/autopilot", label: "Keputusan otomatis", desc: "Tinjau kasus yang diputus autopilot", icon: <IconGavel />, match: (p) => p.startsWith("/console/autopilot") },
  { href: "/console/precheck", label: "Pra-pengajuan", desc: "Cek klaim draft sebelum dikirim rumah sakit", icon: <IconShieldCheck />, match: (p) => p.startsWith("/console/precheck") },
  { href: "/console/audit", label: "Jejak audit", desc: "Catatan semua tindakan, tahan diubah diam-diam", icon: <IconScroll />, match: (p) => p.startsWith("/console/audit") },
  { href: "/console/import", label: "Impor data", desc: "Masukkan data klaim baru dari berkas CSV", icon: <IconUpload />, match: (p) => p.startsWith("/console/import") },
  { href: "/console/metrics", label: "Metrik", desc: "Seberapa akurat SEHATI mendeteksi", icon: <IconChart />, match: (p) => p.startsWith("/console/metrics") },
];

export type NavCounts = { antrean: number; overdue: number };

/** Lambang SEHATI: kotak zamrud dengan huruf S dan kilau emas. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center rounded-lg bg-brand font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      aria-hidden
    >
      S
    </span>
  );
}

export function ConsoleNav({ counts, onNavigate }: { counts?: NavCounts; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Navigasi konsol">
      <ul className="space-y-1">
        {NAV.map((n) => {
          const active = n.match(path);
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                  active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-white" aria-hidden />}
                <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center transition-colors ${active ? "text-white" : "text-white/55 group-hover:text-white"}`}>
                  {n.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {n.label}
                    {n.badge === "antrean" && counts && counts.antrean > 0 && (
                      <span className="rounded-full bg-white/15 px-1.5 text-[11px] font-semibold tabular-nums text-white" title={`${counts.antrean} kasus perlu ditindak`}>
                        {counts.antrean}
                        <span className="sr-only"> kasus perlu ditindak</span>
                      </span>
                    )}
                    {n.badge === "antrean" && counts && counts.overdue > 0 && (
                      <span className="rounded-full bg-danger px-1.5 text-[11px] font-semibold tabular-nums text-white" title={`${counts.overdue} kasus lewat tenggat`}>
                        {counts.overdue}
                        <span className="sr-only"> kasus lewat tenggat</span>
                      </span>
                    )}
                  </span>
                  <span className={`mt-0.5 block text-[11.5px] leading-snug ${active ? "text-white/65" : "text-white/45"}`}>{n.desc}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Menu ponsel: tombol di bilah atas yang membuka laci gelap berisi navigasi lengkap beserta keterangannya. */
export function MobileMenu({ counts, children }: { counts?: NavCounts; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [open]);
  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="menu-ponsel"
        className="flex h-10 items-center gap-2 rounded-lg border border-line bg-card px-3 text-sm font-semibold text-ink"
      >
        <IconMenu width={18} height={18} /> Menu
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="no-print fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <button type="button" aria-label="Tutup menu" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
            <motion.div
              id="menu-ponsel"
              role="dialog"
              aria-modal="true"
              aria-label="Menu konsol"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-y-0 left-0 flex w-[88%] max-w-[22rem] flex-col overflow-y-auto bg-ink p-4 text-white"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2.5">
                  <BrandMark />
                  <span className="text-lg font-semibold tracking-tight">SEHATI</span>
                </span>
                <button type="button" onClick={() => setOpen(false)} aria-label="Tutup menu" className="grid h-9 w-9 place-items-center rounded-lg bg-white/10">
                  <IconX width={18} height={18} />
                </button>
              </div>
              <ConsoleNav counts={counts} onNavigate={() => setOpen(false)} />
              <div className="mt-6 space-y-3">{children}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const ROLE_TERM: Record<string, GlossaryKey> = { casemix: "casemix", verifikator: "verifikator", auditor: "auditor", dokter: "dokter" };

/** Pengganti peran khusus demo. Menjelaskan dengan jelas bahwa ini bukan login: hanya untuk mencoba sudut pandang tiap petugas. */
export function RoleSwitcher({ role, options }: { role: string; options: { value: string; label: string; hint: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [help, setHelp] = useState(false);
  const current = options.find((o) => o.value === role);
  const was = useRef(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pending) was.current = true;
    else if (was.current) {
      was.current = false;
      flashHeading();
    }
  }, [pending]);
  useEffect(() => {
    if (!help) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setHelp(false);
    const d = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-popover]") && setHelp(false);
    document.addEventListener("keydown", k);
    document.addEventListener("mousedown", d);
    return () => {
      document.removeEventListener("keydown", k);
      document.removeEventListener("mousedown", d);
    };
  }, [help]);
  return (
    <div ref={wrap} className="relative min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className="flex min-w-0 items-center gap-2 text-sm">
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-ink-soft">
            Peran demo
            <InfoDot k="peranDemo" />
          </span>
          <span className="relative">
            <IconUser width={15} height={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-brand" />
            <select
              value={role}
              disabled={pending}
              onChange={(e) => {
                document.cookie = `sehati_role=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
                startTransition(() => router.refresh());
              }}
              className="min-w-0 rounded-lg border border-line bg-card py-1.5 pl-8 pr-2 text-sm font-semibold text-ink transition-shadow focus-visible:border-brand disabled:opacity-60"
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <button type="button" onClick={() => setHelp((h) => !h)} aria-expanded={help} className="text-xs font-medium text-ink-soft underline underline-offset-4 hover:text-ink">
          Apa bedanya?
        </button>
      </div>
      <p className="mt-0.5 text-xs text-muted" aria-live="polite">
        {pending ? "Mengganti peran…" : current ? <>Peran ini bisa: <strong className="font-semibold text-ink-soft">{current.hint.toLowerCase()}</strong></> : ""}
      </p>
      <AnimatePresence>
        {help && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-card p-4 shadow-[0_8px_30px_-8px_rgb(11_13_12/0.2)]"
          >
            <p className="eyebrow text-muted">Mode demo</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              Ini bukan login. Di aplikasi sungguhan, setiap petugas hanya melihat perannya sendiri. Di sini Anda bebas berganti peran untuk mencoba sudut pandang masing-masing.
            </p>
            <ul className="mt-3 space-y-2.5">
              {options.map((o) => (
                <li key={o.value} className={`rounded-lg p-2.5 text-sm ${o.value === role ? "border border-brand bg-brand-soft" : "border border-line bg-paper"}`}>
                  <p className="font-bold">
                    {ROLE_TERM[o.value] ? <Term k={ROLE_TERM[o.value]}>{o.label}</Term> : o.label}
                    {o.value === role && <span className="ml-2 text-xs font-semibold text-brand">(sedang dipakai)</span>}
                  </p>
                  <p className="text-xs text-ink-soft">{o.hint}</p>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ResetButton({ tone = "light" }: { tone?: "light" | "dark" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const dark = tone === "dark";
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!confirm("Kembalikan seluruh data demo ke kondisi awal? Perubahan Anda akan hilang.")) return;
          setBusy(true);
          setError(false);
          try {
            const r = await fetch("/api/reset", { method: "POST" });
            if (!r.ok) throw new Error();
            router.refresh();
          } catch {
            setError(true);
          } finally {
            setBusy(false);
          }
        }}
        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-colors disabled:opacity-50 ${
          dark ? "border border-white/10 text-white/80 hover:bg-white/10 hover:text-white" : "border border-line bg-card text-ink-soft hover:bg-paper"
        }`}
      >
        <IconReset width={16} height={16} className="shrink-0" />
        <span>
          <span className="block">{busy ? "Mengatur ulang…" : "Reset data demo"}</span>
          <span className={`block text-[11px] font-normal ${dark ? "text-white/50" : "text-muted"}`}>Kembalikan semua data contoh ke awal</span>
        </span>
      </button>
      <p role="status" className={`mt-1 text-xs font-semibold ${dark ? "text-[#ffb3b8]" : "text-danger"}`}>
        {error ? "Gagal mengatur ulang." : ""}
      </p>
    </div>
  );
}

/** Tautan ke sisi peserta (aplikasi seluler konsep). */
export function ParticipantLink({ tone = "light" }: { tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  return (
    <Link
      href="/m"
      className={`group flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors ${
        dark ? "border border-white/10 text-white hover:bg-white/10" : "text-brand hover:underline"
      }`}
    >
      <span>
        <span className="block">Lihat sisi peserta</span>
        <span className={`block text-[11px] font-normal ${dark ? "text-white/60" : "text-muted"}`}>Tampilan di aplikasi JKN Mobile (konsep)</span>
      </span>
      <IconArrow width={16} height={16} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
