import Link from "next/link";
import type { ReactNode } from "react";
import { InfoDot } from "@/components/explain";
import { AI_MODE_LABEL, DATA_SOURCE_LABEL, PROOF_LABEL, TONE_CLASS, type ProofStatus } from "@/lib/labels";
import type { GlossaryKey } from "@/lib/glossary";

/** Kartu: putih, garis rambut. `elevated` menambah bayangan tipis untuk satu elemen terpenting per layar. */
export function Card({ children, className = "", elevated = false }: { children: ReactNode; className?: string; elevated?: boolean }) {
  return <div className={`rounded-xl border border-line bg-card ${elevated ? "shadow-[0_1px_2px_rgb(11_13_12/0.05),0_4px_12px_-6px_rgb(11_13_12/0.08)]" : ""} ${className}`}>{children}</div>;
}

export function Pill({ children, className = "", title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

export function ProofBadge({ status }: { status: ProofStatus }) {
  const p = PROOF_LABEL[status];
  return <Pill className={TONE_CLASS[p.tone]} title={p.hint}>{p.label}</Pill>;
}

/** Penanda mode AI pada setiap operasi: AI langsung / Simulasi / Fallback. */
export function AiModeBadge({ mode }: { mode: "live" | "simulated" | "fallback" }) {
  const m = AI_MODE_LABEL[mode];
  return <Pill className={TONE_CLASS[m.tone === "ok" ? "ok" : m.tone === "warn" ? "warn" : "muted"]} title={m.hint}>{m.label}</Pill>;
}

export function SourceBadge({ source }: { source: keyof typeof DATA_SOURCE_LABEL }) {
  const tone = source === "live" ? "ok" : source === "unavailable" ? "danger" : source === "import" ? "info" : "muted";
  return <Pill className={TONE_CLASS[tone]} title="Asal data pada tampilan ini">{DATA_SOURCE_LABEL[source]}</Pill>;
}

export function StatusPill({ tone, children, title }: { tone: keyof typeof TONE_CLASS; children: ReactNode; title?: string }) {
  return <Pill className={TONE_CLASS[tone]} title={title}>{children}</Pill>;
}

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Jejak halaman" className="no-print mb-3 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {it.href ? (
              <Link href={it.href} className="font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-mono text-xs font-medium text-ink-soft">{it.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Judul halaman konsol: satu judul, satu kalimat tujuan, satu aksi utama (opsional). */
export function PageHeader({ title, purpose, crumbs, children, eyebrow }: { title: string; purpose?: string; crumbs?: { label: string; href?: string }[]; children?: ReactNode; eyebrow?: string }) {
  return (
    <header className="mb-6">
      {crumbs && <Breadcrumb items={crumbs} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1.5 text-muted">{eyebrow}</p>}
          <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">{title}</h1>
          {purpose && <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">{purpose}</p>}
        </div>
        {children}
      </div>
    </header>
  );
}

export function SectionTitle({ title, hint, info, id, children }: { title: ReactNode; hint?: ReactNode; info?: GlossaryKey; id?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h2 id={id} className="scroll-mt-24 text-base font-semibold tracking-tight">
          {title} {info && <InfoDot k={info} className="text-ink-soft" />}
        </h2>
        {hint && <p className="mt-0.5 text-sm text-ink-soft">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-lg font-semibold text-ink">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-soft">{children}</div>}
    </div>
  );
}

/** Ubin angka (KPI). Selalu sertakan `hint` yang menyebut denominator atau cakupan bila angkanya rasio. */
export function Stat({ label, value, hint, tone = "default", href, info }: { label: string; value: ReactNode; hint?: string; tone?: "default" | "danger" | "ok" | "warn"; href?: string; info?: GlossaryKey }) {
  const dots = { default: "bg-line", danger: "bg-danger", ok: "bg-ok", warn: "bg-accent" };
  return (
    <div className={`relative block rounded-xl border border-line bg-card p-4 ${href ? "transition-colors hover:border-ink/30" : ""}`}>
      <p className="flex items-center gap-2 text-xs font-medium text-ink-soft">
        <span className={`h-1.5 w-1.5 rounded-full ${dots[tone]}`} aria-hidden />
        {href ? (
          <Link href={href} className="after:absolute after:inset-0 after:rounded-xl after:content-['']">
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
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Pesan akses ditolak yang ramah (server tetap menolak aksinya). */
export function Forbidden({ need }: { need?: string }) {
  return (
    <Card className="p-8 text-center">
      <p className="text-lg font-semibold">Peran ini tidak memiliki akses ke halaman ini</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
        Ganti peran lewat pemilih di pojok kanan atas (khusus demo){need ? `. Dibutuhkan wewenang: ${need}.` : "."}
      </p>
    </Card>
  );
}

/** Peringatan permanen untuk data/mesin simulasi. */
export function SimNotice({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-line bg-brand-soft/60 px-3 py-2 text-xs text-ink-soft">{children}</div>;
}
