import Link from "next/link";
import type { ReactNode } from "react";
import { InfoDot } from "@/components/explain";
import { TableFrame } from "@/components/TableFrame";
import { IconAlert, IconArrowUpRight, IconCheckCircle, IconChevronRight, IconInfo, IconLock } from "@/components/icons";
import { AI_MODE_LABEL, DATA_SOURCE_LABEL, PROOF_LABEL, TONE_CLASS, type ProofStatus } from "@/lib/labels";
import type { GlossaryKey } from "@/lib/glossary";

/* Perkakas antarmuka bersama SEHATI. Lihat docs/DESIGN-SYSTEM.md untuk aturan pemakaian.
   Semua halaman konsol, portal faskes, dan beranda memakai komponen ini agar tampil sebagai satu produk. */

type Tone = keyof typeof TONE_CLASS;

/** Kartu: putih, sudut 16px, bayangan e1 dengan sorotan tipis di tepi atas.
    `elevated` untuk satu elemen terpenting per layar. `interactive` untuk kartu yang seluruhnya bisa diklik. */
export function Card({ children, className = "", elevated = false, interactive = false }: { children: ReactNode; className?: string; elevated?: boolean; interactive?: boolean }) {
  return (
    <div
      className={`${/(^|\s)bg-/.test(className) ? "" : "surface-hi "}rounded-card bg-card ${elevated ? "shadow-e2" : "shadow-e1"} ${interactive ? "transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-px hover:shadow-e2 motion-reduce:hover:translate-y-0" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

/** Deret ubin angka. Desktop: grid auto-fit. HP (< sm): satu baris geser dengan snap, menembus tepi halaman. */
export function StatGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`no-scrollbar -mx-4 grid snap-x snap-mandatory auto-cols-[minmax(9.5rem,1fr)] grid-flow-col gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 pt-0.5 sm:mx-0 sm:snap-none sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-[repeat(auto-fit,minmax(min(100%,12.5rem),1fr))] sm:overflow-visible sm:p-0 [&>*]:snap-start ${className}`}
    >
      {children}
    </div>
  );
}

/** Kepala kartu: judul + keterangan + aksi, dipisah garis rambut dari isi. */
export function CardHeader({ title, hint, children, className = "" }: { title: ReactNode; hint?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5 ${className}`}>
      <div className="min-w-0">
        <h3 className="text-body-sm font-semibold tracking-tight text-ink">{title}</h3>
        {hint && <p className="mt-0.5 text-caption text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function Pill({ children, className = "", title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-caption font-medium leading-none ${className}`}>
      {children}
    </span>
  );
}

const DOT: Record<Tone, string> = { muted: "bg-muted/70", info: "bg-info", warn: "bg-accent", ok: "bg-ok", danger: "bg-danger" };

/** Lencana status dengan titik warna. Warna status hanya dipakai untuk status. */
export function StatusPill({ tone, children, title, dot = true }: { tone: Tone; children: ReactNode; title?: string; dot?: boolean }) {
  return (
    <Pill className={TONE_CLASS[tone]} title={title}>
      {dot && <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />}
      {children}
    </Pill>
  );
}

export function ProofBadge({ status }: { status: ProofStatus }) {
  const p = PROOF_LABEL[status];
  return <StatusPill tone={p.tone} title={p.hint}>{p.label}</StatusPill>;
}

/** Penanda mode AI pada setiap operasi: AI langsung / Simulasi / Fallback. */
export function AiModeBadge({ mode }: { mode: "live" | "simulated" | "fallback" }) {
  const m = AI_MODE_LABEL[mode];
  return <StatusPill tone={m.tone === "ok" ? "ok" : m.tone === "warn" ? "warn" : "muted"} title={m.hint}>{m.label}</StatusPill>;
}

export function SourceBadge({ source }: { source: keyof typeof DATA_SOURCE_LABEL }) {
  const tone = source === "live" ? "ok" : source === "unavailable" ? "danger" : source === "import" ? "info" : "muted";
  return <StatusPill tone={tone} title="Asal data pada tampilan ini">{DATA_SOURCE_LABEL[source]}</StatusPill>;
}

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Jejak halaman" className="no-print mb-3 text-caption text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <IconChevronRight size={14} className="shrink-0 text-line-strong" />}
            {it.href ? (
              <Link href={it.href} className="rounded px-0.5 font-medium text-ink-soft transition-colors hover:text-ink">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate px-0.5 font-mono text-code text-muted">{it.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Judul halaman: satu judul, satu kalimat tujuan, aksi utama di kanan (opsional). */
export function PageHeader({ title, purpose, crumbs, children, eyebrow }: { title: string; purpose?: string; crumbs?: { label: string; href?: string }[]; children?: ReactNode; eyebrow?: string }) {
  return (
    <header className="mb-7" data-page-title={title}>
      {crumbs && <Breadcrumb items={crumbs} />}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-[60ch]">
          {eyebrow && <p className="eyebrow mb-2 text-muted">{eyebrow}</p>}
          <h1 className="text-title-1 font-semibold text-ink">{title}</h1>
          {purpose && <p className="mt-2 text-body text-muted">{purpose}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </header>
  );
}

export function SectionTitle({ title, hint, info, id, children }: { title: ReactNode; hint?: ReactNode; info?: GlossaryKey; id?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 id={id} className="flex scroll-mt-24 items-center gap-1.5 text-body font-semibold tracking-tight text-ink">
          {title} {info && <InfoDot k={info} className="text-ink-soft" />}
        </h2>
        {hint && <p className="mt-1 max-w-3xl text-body-sm leading-relaxed text-ink-soft">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** Bagian halaman dengan jarak vertikal standar. */
export function Section({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`mt-10 space-y-4 first:mt-0 ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-subtle text-muted ring-1 ring-line" aria-hidden>
        {icon ?? <IconCheckCircle size={18} />}
      </span>
      <p className="mt-3 text-body font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-body-sm leading-relaxed text-ink-soft">{children}</div>}
    </div>
  );
}

const STAT_DOT = { default: "bg-line-strong", danger: "bg-danger", ok: "bg-ok", warn: "bg-accent" };

/** Ubin angka (KPI). Selalu sertakan `hint` yang menyebut denominator atau cakupan bila angkanya rasio. */
export function Stat({ label, value, hint, tone = "default", href, info }: { label: string; value: ReactNode; hint?: string; tone?: "default" | "danger" | "ok" | "warn"; href?: string; info?: GlossaryKey }) {
  return (
    <div className={`surface-hi group relative flex min-w-0 flex-col rounded-card bg-card px-4 py-3.5 shadow-e1 ${href ? "transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-px hover:shadow-e2 motion-reduce:hover:translate-y-0" : ""}`}>
      <p className="flex items-start gap-2 pr-5 text-caption font-medium leading-snug text-ink-soft">
        <span className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${STAT_DOT[tone]}`} aria-hidden />
        {href ? (
          <Link href={href} className="after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-brand">
            {label}
          </Link>
        ) : (
          label
        )}
        {info && (
          <span className="relative z-10">
            <InfoDot k={info} />
          </span>
        )}
      </p>
      {href && <IconArrowUpRight size={15} className="absolute right-3.5 top-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />}
      <p className="mt-2.5 text-title-1 font-semibold leading-none tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-2 text-caption leading-snug text-muted">{hint}</p>}
    </div>
  );
}

/** Pesan akses ditolak yang ramah (server tetap menolak aksinya). */
export function Forbidden({ need }: { need?: string }) {
  return (
    <Card className="mx-auto max-w-lg">
      <EmptyState title="Peran ini tidak memiliki akses ke halaman ini" icon={<IconLock size={18} />}>
        Ganti peran lewat pemilih peran demo{need ? `. Dibutuhkan wewenang: ${need}.` : "."}
      </EmptyState>
    </Card>
  );
}

const NOTICE: Record<"neutral" | "info" | "warn" | "danger" | "ok", { box: string; icon: ReactNode }> = {
  neutral: { box: "border-line bg-subtle/70 text-ink-soft", icon: <IconInfo size={15} className="text-muted" /> },
  info: { box: "border-brand/15 bg-brand-tint text-ink-soft", icon: <IconInfo size={15} className="text-brand" /> },
  warn: { box: "border-warn/20 bg-warn-soft text-ink-soft", icon: <IconAlert size={15} className="text-warn" /> },
  danger: { box: "border-danger/20 bg-danger-soft text-ink-soft", icon: <IconAlert size={15} className="text-danger" /> },
  ok: { box: "border-ok/20 bg-ok-soft text-ink-soft", icon: <IconCheckCircle size={15} className="text-ok" /> },
};

/** Catatan sebaris dengan ikon. Untuk penjelasan, batasan, dan peringatan yang tenang. */
export function Notice({ tone = "info", title, children, className = "" }: { tone?: keyof typeof NOTICE; title?: ReactNode; children?: ReactNode; className?: string }) {
  const n = NOTICE[tone];
  return (
    <div className={`flex gap-2.5 rounded-control border px-3.5 py-2.5 text-caption leading-relaxed ${n.box} ${className}`}>
      <span className="mt-[3px] shrink-0">{n.icon}</span>
      <div className="min-w-0">
        {title && <p className="font-semibold text-ink">{title}</p>}
        {children}
      </div>
    </div>
  );
}

/** Peringatan permanen untuk data/mesin simulasi. */
export function SimNotice({ children }: { children: ReactNode }) {
  return <Notice tone="info">{children}</Notice>;
}

/** Wadah tabel: kartu dengan gulir horizontal untuk tabel lebar. Sel memakai padding px-4 py-3. */
export function TableCard({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return <TableFrame className={className} label={label}>{children}</TableFrame>;
}

/** Bilah filter/pencarian di atas daftar. */
export function Toolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`panel-inset flex flex-wrap items-end gap-x-3 gap-y-3 p-3 ${className}`}>{children}</div>;
}

/** Tab berbasis tautan (aman untuk komponen server). `active` dihitung oleh pemanggil. */
export function LinkTabs({ items, label }: { items: { href: string; label: ReactNode; active: boolean; count?: number }[]; label: string }) {
  return (
    <nav aria-label={label} className="scroll-x border-b border-line">
      <ul className="flex min-w-max gap-5">
        {items.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 py-2.5 text-body-sm font-medium transition-colors ${t.active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {t.label}
              {t.count !== undefined && <span className={`rounded-md px-1.5 text-caption tabular-nums ${t.active ? "bg-ink text-white" : "bg-subtle text-ink-soft"}`}>{t.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Daftar keterangan dua kolom (label → nilai). */
export function DescList({ items, className = "" }: { items: { k: ReactNode; v: ReactNode }[]; className?: string }) {
  return (
    <dl className={`divide-y divide-line text-body-sm ${className}`}>
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
          <dt className="text-caption text-muted">{it.k}</dt>
          <dd className="min-w-0 break-words text-ink">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

/** Kerangka halaman saat memuat. */
export function PageSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Memuat" className="animate-fade-in">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-72 max-w-full" />
      <Skeleton className="mt-3 h-4 w-[28rem] max-w-full" />
      <div className="mt-8 grid-auto-sm">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px] rounded-card" />)}
      </div>
      <Skeleton className="mt-8 h-72 rounded-card" />
      <span className="sr-only">Memuat…</span>
    </div>
  );
}
