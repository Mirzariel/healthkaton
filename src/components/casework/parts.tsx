import Link from "next/link";
import type { ReactNode } from "react";
import { Pill } from "@/components/ui";
import { TONE_CLASS } from "@/lib/labels";
import type { Tone } from "@/lib/casework/labels";

export const tone = (t: Tone) => TONE_CLASS[t];

export function Tag({ t, children, title }: { t: Tone; children: ReactNode; title?: string }) {
  return <Pill className={TONE_CLASS[t]} title={title}>{children}</Pill>;
}

export function Pager({ base, page, pages, params }: { base: string; page: number; pages: number; params: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  const href = (n: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set("page", String(n));
    return `${base}?${q.toString()}`;
  };
  return (
    <nav aria-label="Halaman" className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-muted">Halaman <span className="font-medium tabular-nums text-ink">{page}</span> dari <span className="tabular-nums">{pages}</span></span>
      <span className="flex gap-2">
        {page > 1 ? <Link href={href(page - 1)} className="btn btn-secondary btn-sm">← Sebelumnya</Link> : <span aria-disabled="true" className="btn btn-secondary btn-sm">← Sebelumnya</span>}
        {page < pages ? <Link href={href(page + 1)} className="btn btn-secondary btn-sm">Berikutnya →</Link> : <span aria-disabled="true" className="btn btn-secondary btn-sm">Berikutnya →</span>}
      </span>
    </nav>
  );
}

/** Kotak pernyataan dengan sumbernya, dipakai ringkasan asisten dan bukti. */
export function Quote({ children, by }: { children: ReactNode; by?: string }) {
  return (
    <blockquote className="rounded-r-lg border-l-2 border-brand/50 bg-brand-tint px-3.5 py-2.5 text-[14px] leading-relaxed text-ink">
      {children}
      {by && <footer className="mt-1.5 text-[12px] text-muted">{by}</footer>}
    </blockquote>
  );
}

export function KV({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-2 text-[14px]">
      <dt className="text-[13px] text-muted">{k}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function userName(id: string | null | undefined, names: Map<string, string>) {
  if (!id) return "Belum ditugaskan";
  if (id.startsWith("sistem")) return "Sistem";
  return names.get(id) ?? id.split(":")[1] ?? id;
}
