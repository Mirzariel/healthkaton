import Link from "next/link";
import type { ReactNode } from "react";
import { IconChevronRight } from "@/components/icons";

/* Potongan tampilan bersama untuk modul operasional konsol (antrean, dokumen, pending, impor). Hanya presentasi. */

/** Jenis peristiwa status pembayaran dalam bahasa petugas. */
export const PAY_EVENT_LABEL: Record<string, string> = { submitted: "Diajukan", complete: "Berkas lengkap", due: "Jatuh tempo", paid: "Dibayar", pending: "Ditunda pembayar", returned: "Dikembalikan" };

/** Kode alasan pembayar (mis. BERKAS_KURANG) menjadi teks biasa. Kode asli tetap tersedia sebagai title. */
export function reasonLabel(code: string) {
  const t = code.toLowerCase().replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** ID rekaman (kasus, temuan, klaim, dokumen). */
export function RecordId({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[12px] text-muted ${className}`}>{children}</span>;
}

/** Tautan judul baris pada tabel. */
export const rowLink = "font-medium text-ink underline-offset-4 decoration-line-strong hover:text-brand-ink hover:underline";

/** Formulir saring GET dalam satu bilah berbentuk grid. Nama parameter diberikan pemanggil dan tidak diubah. */
export function FilterForm({ label, children, resetHref, cols = "sm:grid-cols-3 lg:grid-cols-4", submit = "Terapkan" }: { label: string; children: ReactNode; resetHref?: string; cols?: string; submit?: string }) {
  return (
    <form method="get" aria-label={label} className="no-print">
      <div className={`grid grid-cols-2 items-end gap-x-3 gap-y-3 rounded-xl border border-line bg-card p-3 ${cols}`}>
        {children}
        <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
          <button type="submit" className="btn btn-primary flex-1 sm:flex-none">{submit}</button>
          {resetHref && <Link href={resetHref} className="btn btn-ghost">Atur ulang</Link>}
        </div>
      </div>
    </form>
  );
}

/** Satu kontrol dengan label di atasnya. `span` melebarkan kolom pada layar lebar. */
export function FilterField({ label, children, span = "" }: { label: string; children: ReactNode; span?: string }) {
  return (
    <label className={`block min-w-0 ${span}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

/** Baris angka pada daftar "perlu perhatian". */
export function AttentionRow({ href, label, hint, count, tone = "default" }: { href: string; label: string; hint?: string; count: number | string; tone?: "default" | "warn" | "danger" }) {
  const dot = tone === "danger" ? "bg-danger" : tone === "warn" ? "bg-accent" : "bg-line-strong";
  return (
    <Link href={href} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-subtle/60">
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-[12.5px] text-muted">{hint}</span>}
      </span>
      <span className="text-[1.25rem] font-semibold leading-none tabular-nums text-ink">{count}</span>
      <IconChevronRight size={15} className="shrink-0 text-line-strong transition-colors group-hover:text-ink-soft" />
    </Link>
  );
}

/** Judul bagian dalam kartu tanpa kepala (subjudul kecil). */
export function MiniTitle({ children }: { children: ReactNode }) {
  return <h4 className="text-[13px] font-semibold text-ink">{children}</h4>;
}

/** Fakta ringkas bertumpu (label kecil, nilai) untuk kolom samping yang sempit. */
export function SideFacts({ items }: { items: { k: string; v: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-line text-[13.5px]">
      {items.map((it) => (
        <div key={it.k} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-3 py-2 first:pt-0 last:pb-0">
          <dt className="text-[13px] text-muted">{it.k}</dt>
          <dd className="min-w-0 break-words text-ink">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Tautan lompat dalam halaman (anchor biasa agar OpenOnHash menangkap hashchange). */
export function JumpLink({ href, children, count }: { href: string; children: ReactNode; count?: ReactNode }) {
  return (
    <a href={href} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13.5px] text-ink-soft transition-colors hover:bg-subtle hover:text-ink">
      <span className="min-w-0 truncate">{children}</span>
      {count !== undefined && <span className="shrink-0 text-[12px] tabular-nums text-muted">{count}</span>}
    </a>
  );
}

/** Panel sisipan yang lebih tenang daripada kartu putih: untuk kolom samping dan info sekunder. */
export function Inset({ title, hint, children, flush = false, className = "" }: { title?: ReactNode; hint?: ReactNode; children: ReactNode; flush?: boolean; className?: string }) {
  return (
    <section className={`rounded-xl bg-subtle/70 ring-1 ring-line ${className}`}>
      {title && (
        <div className="px-5 pb-1 pt-4">
          <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
          {hint && <p className="mt-0.5 text-[12.5px] text-muted">{hint}</p>}
        </div>
      )}
      <div className={flush ? "" : "px-5 pb-4 pt-2"}>{children}</div>
    </section>
  );
}
