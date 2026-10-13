import Link from "next/link";
import type { ReactNode } from "react";
import { InfoDot } from "@/components/explain";
import { IconChevronDown } from "@/components/icons";
import { Card } from "@/components/ui";
import type { GlossaryKey } from "@/lib/glossary";

/** Kisi sel bergaris: satu kartu berisi beberapa sel berdampingan. Cocok untuk alur atau ringkasan berurutan.
    Bawaan: kolom auto-fit (min 18rem). `className` menggantikan aturan kolom bila diberikan. */
export function CellGrid({ children, className = "grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))]" }: { children: ReactNode; className?: string }) {
  return (
    <Card elevated className="overflow-hidden">
      <div className={`-mb-px -mr-px grid ${className}`}>{children}</div>
    </Card>
  );
}
export function Cell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 border-b border-r border-line p-4 ${className}`}>{children}</div>;
}

/** Ubin metrik sekunder (lebih kecil dari Stat). `children` untuk tampilan nilai khusus. */
export function Metric({ label, value, hint, info, children, className = "" }: { label: ReactNode; value?: ReactNode; hint?: ReactNode; info?: GlossaryKey; children?: ReactNode; className?: string }) {
  return (
    <Card className={`min-w-0 px-4 py-3.5 ${className}`}>
      <p className="flex items-center gap-1.5 text-caption font-medium leading-snug text-ink-soft">{label}{info && <InfoDot k={info} />}</p>
      {value !== undefined && <p className="mt-1.5 text-title-2 font-semibold leading-none tabular-nums text-ink">{value}</p>}
      {children && <div className="mt-1.5">{children}</div>}
      {hint && <p className="mt-2 text-caption leading-snug text-muted">{hint}</p>}
    </Card>
  );
}

/** Pengungkap (details) bergaya SEHATI: judul + chevron, isi tersembunyi sampai dibuka. `flush` menghilangkan padding isi (untuk tabel). */
export function Disclosure({ title, meta, children, className = "", defaultOpen = false, flush = false }: { title: ReactNode; meta?: ReactNode; children: ReactNode; className?: string; defaultOpen?: boolean; flush?: boolean }) {
  return (
    <Card className={className}>
      <details open={defaultOpen} className="group">
        <summary className="flex min-h-11 items-center justify-between gap-3 rounded-card px-4 py-2.5 text-body-sm font-semibold text-ink hover:bg-subtle/60">
          <span className="min-w-0">{title}</span>
          <span className="flex shrink-0 items-center gap-2 text-caption font-normal text-muted">
            {meta}
            <IconChevronDown size={16} className="transition-transform duration-150 group-open:rotate-180" />
          </span>
        </summary>
        <div className={`border-t border-line ${flush ? "" : "px-4 py-4"}`}>{children}</div>
      </details>
    </Card>
  );
}

/** Catatan panjang yang disembunyikan di balik "Selengkapnya". Teks ringkas tetap ditulis oleh pemanggil di luar komponen ini. */
export function More({ children, label = "Selengkapnya", className = "" }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <details className={`group text-caption leading-relaxed text-muted ${className}`}>
      <summary className="inline-flex cursor-pointer items-center gap-1 font-medium text-ink-soft hover:text-ink">
        {label}
        <IconChevronDown size={14} className="transition-transform duration-150 group-open:rotate-180" />
      </summary>
      <div className="mt-1.5 max-w-3xl">{children}</div>
    </details>
  );
}

/** Panel sisipan: informasi sekunder di atas kanvas, lebih tenang daripada kartu putih. */
export function Inset({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-subtle/70 ring-1 ring-inset ring-line ${className}`}>{children}</div>;
}

/** Label + kontrol untuk bilah filter. */
export function FilterField({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 text-caption font-medium text-ink-soft ${className}`}>
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

/** Pil filter berbasis tautan. `active` dihitung oleh pemanggil. */
export function FilterChips({ items, label }: { items: { href: string; label: ReactNode; active: boolean; count?: number }[]; label: string }) {
  return (
    <nav aria-label={label} className="no-print">
      <ul className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <li key={i}>
            <Link
              href={it.href}
              aria-current={it.active ? "page" : undefined}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-caption font-medium transition-colors ${it.active ? "border-ink bg-ink text-white" : "border-line-strong bg-card text-ink-soft hover:bg-subtle hover:text-ink"}`}
            >
              {it.label}
              {it.count !== undefined && <span className={`text-caption tabular-nums ${it.active ? "text-white/75" : "text-muted"}`}>{it.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Kepala tabel; `num` menyelaraskan ke kanan untuk kolom angka. */
export function Th({ children, num = false, className = "", title }: { children?: ReactNode; num?: boolean; className?: string; title?: string }) {
  return <th title={title} scope="col" className={`px-4 py-2.5 ${num ? "text-right" : "text-left"} ${className}`}>{children}</th>;
}
