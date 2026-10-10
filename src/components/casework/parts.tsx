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
    <nav aria-label="Halaman" className="flex items-center justify-between gap-3 text-sm">
      {page > 1 ? <Link href={href(page - 1)} className="font-semibold underline-offset-4 hover:underline">← Sebelumnya</Link> : <span />}
      <span className="text-ink-soft">Halaman {page} dari {pages}</span>
      {page < pages ? <Link href={href(page + 1)} className="font-semibold underline-offset-4 hover:underline">Berikutnya →</Link> : <span />}
    </nav>
  );
}

/** Kotak pernyataan dengan sumbernya, dipakai ringkasan asisten dan bukti. */
export function Quote({ children, by }: { children: ReactNode; by?: string }) {
  return (
    <blockquote className="rounded-lg border-l-4 border-brand/40 bg-brand-soft/40 px-3 py-2 text-sm">
      {children}
      {by && <footer className="mt-1 text-xs text-muted">{by}</footer>}
    </blockquote>
  );
}

export function KV({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-ink-soft">{k}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function userName(id: string | null | undefined, names: Map<string, string>) {
  if (!id) return "Belum ditugaskan";
  if (id.startsWith("sistem")) return "Sistem";
  return names.get(id) ?? id.split(":")[1] ?? id;
}
