import Link from "next/link";
import type { ReactNode } from "react";
import { Pill } from "@/components/ui";
import type { BeforeAfter, GapRow, QualityFilters } from "@/lib/quality/metrics";
import { num, pct, pctRange } from "@/lib/quality/stats";

export const CARE_LABEL = { outpatient: "Rawat jalan", inpatient: "Rawat inap" } as const;

/** Komposisi jawaban satu baris: negatif / positif / tidak tahu / tidak berlaku / tidak ditanya / tidak merespons. Selalu disertai angka pada kolom lain. */
export function CompositionBar({ row }: { row: GapRow }) {
  const total = row.eligible - row.in_progress;
  if (total <= 0) return <span className="text-xs text-muted">–</span>;
  const seg: { k: string; n: number; cls: string; label: string }[] = [
    { k: "neg", n: row.negative, cls: "bg-danger", label: "belum terpenuhi" },
    { k: "pos", n: row.positive, cls: "bg-ok", label: "terpenuhi" },
    { k: "unk", n: row.unknown, cls: "bg-accent", label: "tidak tahu/tidak paham" },
    { k: "na", n: row.not_applicable, cls: "bg-line", label: "tidak berlaku" },
    { k: "nask", n: row.not_asked, cls: "bg-muted/50", label: "tidak ditanya" },
    { k: "nr", n: row.nonresponse, cls: "bg-ink/25", label: "tidak merespons" },
  ];
  const title = seg.map((s) => `${s.label}: ${s.n}`).join("; ");
  return (
    <div role="img" aria-label={title} title={title} className="flex h-2.5 w-full min-w-24 overflow-hidden rounded-full bg-line">
      {seg.filter((s) => s.n > 0).map((s) => (
        <span key={s.k} className={s.cls} style={{ width: `${(s.n / total) * 100}%` }} />
      ))}
    </div>
  );
}

export function CompositionLegend() {
  const items: [string, string][] = [
    ["bg-danger", "Belum terpenuhi (pembilang gap)"], ["bg-ok", "Terpenuhi"], ["bg-accent", "Tidak tahu / tidak paham"], ["bg-line", "Tidak berlaku"], ["bg-muted/50", "Tidak ditanya"], ["bg-ink/25", "Tidak merespons"],
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft" aria-label="Keterangan warna">
      {items.map(([c, l]) => (
        <li key={l} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${c}`} aria-hidden />{l}</li>
      ))}
    </ul>
  );
}

/** Rasio gap dengan interval. Di bawah jumlah minimum, angka tetap tampil tetapi diberi penanda "belum cukup" dan tidak dibaca sebagai analisis agregat. */
export function GapCell({ row }: { row: Pick<GapRow, "gap" | "ci" | "n_valid" | "sufficient"> }) {
  if (row.gap === null) return <span className="text-muted">–</span>;
  return (
    <span className={row.sufficient ? "" : "text-muted"}>
      <span className="font-semibold tabular-nums">{pct(row.gap)}</span>
      <span className="ml-1 text-xs tabular-nums text-muted">({pctRange(row.ci)})</span>
      {!row.sufficient && <Pill className="ml-1.5 bg-warn-soft text-warn" title="Jawaban sah kurang dari batas minimum untuk analisis agregat. Laporan individual tetap ditindaklanjuti.">Data belum cukup</Pill>}
    </span>
  );
}

export function hrefWith(base: string, f: QualityFilters, over: Partial<Record<"from" | "to" | "facility" | "care" | "stage" | "mode" | "indicator", string | null>>): string {
  const q = new URLSearchParams();
  const cur: Record<string, string | null | undefined> = { from: f.from, to: f.to, facility: f.facilityId, care: f.careType, stage: f.stage, mode: f.mode === "directed" ? "directed" : null, indicator: f.indicatorId };
  for (const [k, v] of Object.entries({ ...cur, ...over })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export function Th({ children, className = "", title }: { children: ReactNode; className?: string; title?: string }) {
  return <th title={title} className={`p-3 text-xs font-medium text-muted ${className}`}>{children}</th>;
}

export const VERDICT: Record<BeforeAfter["verdict"], { label: string; cls: string }> = {
  insufficient: { label: "Data belum cukup", cls: "bg-warn-soft text-warn" },
  distinct_lower: { label: "Lebih rendah setelah tindakan (interval tidak tumpang tindih)", cls: "bg-ok-soft text-ok" },
  distinct_higher: { label: "Lebih tinggi setelah tindakan (interval tidak tumpang tindih)", cls: "bg-danger-soft text-danger" },
  indistinct: { label: "Belum dapat dibedakan dari fluktuasi acak", cls: "bg-line text-ink-soft" },
  not_resolved: { label: "Tindakan belum selesai dikerjakan", cls: "bg-info-soft text-info" },
};

export function MiniStat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export { Link, num };
