import type { ReactNode } from "react";
import { Card } from "@/components/ui";

/* Primitif grafik CSS murni untuk dasbor analitik. Tanpa pustaka grafik. Setiap grafik selalu disertai angka tepatnya
   (di tabel, legenda, atau label) dan memiliki teks alternatif. */

export interface Segment { key: string; n: number; cls: string; label: string }

/** Bilah bertumpuk: komposisi suatu total. Segmen bernilai 0 tidak digambar. */
export function StackedBar({ segments, total, height = "h-2.5", className = "" }: { segments: Segment[]; total?: number; height?: string; className?: string }) {
  const sum = total ?? segments.reduce((a, s) => a + s.n, 0);
  const title = segments.map((s) => `${s.label}: ${s.n}`).join("; ");
  if (sum <= 0) return <span className="text-caption text-muted">–</span>;
  return (
    <div role="img" aria-label={title} title={title} className={`flex ${height} w-full min-w-24 gap-px overflow-hidden rounded-full bg-line ${className}`}>
      {segments.filter((s) => s.n > 0).map((s) => (
        <span key={s.key} className={s.cls} style={{ width: `${(s.n / sum) * 100}%` }} />
      ))}
    </div>
  );
}

/** Legenda untuk StackedBar. `counts` menampilkan jumlah tepat di samping tiap keterangan. */
export function Legend({ items, counts = false, label = "Keterangan warna", className = "" }: { items: { cls: string; label: string; n?: number }[]; counts?: boolean; label?: string; className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-1.5 text-caption text-ink-soft ${className}`} aria-label={label}>
      {items.map((s) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${s.cls}`} aria-hidden />
          {s.label}
          {counts && s.n !== undefined && <span className="font-medium tabular-nums text-ink">{s.n}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Satu nilai proporsi pada trek 0–100%. */
export function MeterBar({ value, tone = "brand", muted = false, className = "" }: { value: number | null; tone?: "brand" | "warn" | "ink"; muted?: boolean; className?: string }) {
  const v = Math.max(0, Math.min(1, value ?? 0));
  const fill = muted ? "bg-muted/45" : tone === "warn" ? "bg-accent" : tone === "ink" ? "bg-ink/70" : "bg-brand";
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-line ${className}`} aria-hidden>
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

/** Titik estimasi dengan rentang ketidakpastian pada skala 0–100%. Gambar pelengkap: angka tepat tetap ditulis di dekatnya. */
export function IntervalBar({ value, lo, hi, muted = false }: { value: number | null; lo: number | null; hi: number | null; muted?: boolean }) {
  if (value === null || lo === null || hi === null) return null;
  const p = (x: number) => `${Math.max(0, Math.min(1, x)) * 100}%`;
  return (
    <div className="relative h-3 w-full" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
      <div className={`absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full ${muted ? "bg-muted/35" : "bg-brand/25"}`} style={{ left: p(lo), width: `max(2px, ${Math.max(0, hi - lo) * 100}%)` }} />
      <div className={`absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full ${muted ? "bg-muted" : "bg-brand"}`} style={{ left: p(value) }} />
    </div>
  );
}

export interface TrendPoint { key: string; label: string; value: number | null; lo?: number | null; hi?: number | null; muted?: boolean; note?: string }

/** Grafik kolom kecil untuk tren per bulan. Kolom abu-abu = data belum cukup. Skala dimulai dari 0 dan berakhir pada nilai tertinggi (termasuk batas atas interval). Garis tipis = interval. */
export function ColumnTrend({ points, caption }: { points: TrendPoint[]; caption?: ReactNode }) {
  const max = Math.max(0.05, ...points.map((p) => p.hi ?? p.value ?? 0));
  const top = Math.min(1, Math.ceil(max * 20) / 20);
  const h = (x: number) => `${(x / top) * 100}%`;
  return (
    <Card className="px-4 pb-3 pt-4"><figure>
      <div className="flex gap-3">
        <div className="flex h-36 flex-col justify-between text-right text-caption tabular-nums text-muted" aria-hidden>
          <span>{Math.round(top * 100)}%</span>
          <span>0%</span>
        </div>
        <div className="scroll-x min-w-0 flex-1">
          <ul className="flex h-36 min-w-max items-end gap-2 border-b border-line">
            {points.map((p) => (
              <li key={p.key} className="relative flex h-full w-10 flex-1 items-end justify-center" title={`${p.label}: ${p.value === null ? "–" : `${(p.value * 100).toFixed(0)}%`}${p.note ? `; ${p.note}` : ""}`}>
                {p.value !== null && (
                  <>
                    <span className={`block w-full max-w-9 rounded-t ${p.muted ? "bg-muted/35" : "bg-brand/80"}`} style={{ height: h(p.value) }} />
                    {p.lo != null && p.hi != null && <span className="absolute w-px bg-ink/45" style={{ bottom: h(p.lo), height: `calc(${h(p.hi)} - ${h(p.lo)})` }} aria-hidden />}
                  </>
                )}
              </li>
            ))}
          </ul>
          <ul className="flex min-w-max gap-2 pt-1.5" aria-hidden>
            {points.map((p) => (
              <li key={p.key} className="w-10 flex-1 text-center text-caption text-muted">{p.label}</li>
            ))}
          </ul>
        </div>
      </div>
      {caption && <figcaption className="mt-2 text-caption text-muted">{caption}</figcaption>}
    </figure></Card>
  );
}

export interface BreakdownRow { key: string; label: ReactNode; n: number; cls?: string }

/** Daftar rincian dengan bilah proporsional. Angka dan persentase selalu tertulis. */
export function Breakdown({ rows, total, empty = "Belum ada.", showPct = true }: { rows: BreakdownRow[]; total?: number; empty?: ReactNode; showPct?: boolean }) {
  const sum = total ?? rows.reduce((a, r) => a + r.n, 0);
  if (!rows.length) return <p className="px-5 py-4 text-body-sm text-ink-soft">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-5 py-2.5 text-body-sm">
          <span className="min-w-0 text-ink-soft [overflow-wrap:anywhere]">{r.label}</span>
          <span className="font-medium tabular-nums text-ink">
            {r.n}
            {showPct && sum > 0 && <span className="ml-1.5 text-caption font-normal text-muted">{((r.n / sum) * 100).toFixed(0)}%</span>}
          </span>
          <span className="col-span-2 h-1 overflow-hidden rounded-full bg-line" aria-hidden>
            <span className={`block h-full rounded-full ${r.cls ?? "bg-ink/40"}`} style={{ width: `${sum > 0 ? (r.n / sum) * 100 : 0}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
