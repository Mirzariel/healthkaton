import Link from "next/link";
import type { ReactNode } from "react";
import { Legend, StackedBar } from "@/components/analytics/charts";
import { Metric } from "@/components/analytics/blocks";
import { StatusPill } from "@/components/ui";
import type { BeforeAfter, GapRow, QualityFilters } from "@/lib/quality/metrics";
import { num, pct, pctRange } from "@/lib/quality/stats";

export const CARE_LABEL = { outpatient: "Rawat jalan", inpatient: "Rawat inap" } as const;

const SEGMENTS: { k: string; cls: string; label: string; legend: string }[] = [
  { k: "neg", cls: "bg-danger", label: "belum terpenuhi", legend: "Belum terpenuhi (pembilang gap)" },
  { k: "pos", cls: "bg-ok", label: "terpenuhi", legend: "Terpenuhi" },
  { k: "unk", cls: "bg-accent", label: "tidak tahu/tidak paham", legend: "Tidak tahu / tidak paham" },
  { k: "na", cls: "bg-line-strong", label: "tidak berlaku", legend: "Tidak berlaku" },
  { k: "nask", cls: "bg-muted/50", label: "tidak ditanya", legend: "Tidak ditanya" },
  { k: "nr", cls: "bg-ink/25", label: "tidak merespons", legend: "Tidak merespons" },
];

/** Komposisi jawaban satu baris: negatif / positif / tidak tahu / tidak berlaku / tidak ditanya / tidak merespons. Selalu disertai angka pada kolom lain. */
export function CompositionBar({ row }: { row: GapRow }) {
  const total = row.eligible - row.in_progress;
  if (total <= 0) return <span className="text-[12px] text-muted">–</span>;
  const n: Record<string, number> = { neg: row.negative, pos: row.positive, unk: row.unknown, na: row.not_applicable, nask: row.not_asked, nr: row.nonresponse };
  return <StackedBar total={total} segments={SEGMENTS.map((s) => ({ key: s.k, n: n[s.k], cls: s.cls, label: s.label }))} />;
}

export function CompositionLegend() {
  return <Legend items={SEGMENTS.map((s) => ({ cls: s.cls, label: s.legend }))} />;
}

/** Rasio gap dengan interval. Di bawah jumlah minimum, angka tetap tampil tetapi diberi penanda "belum cukup" dan tidak dibaca sebagai analisis agregat. */
export function GapCell({ row }: { row: Pick<GapRow, "gap" | "ci" | "n_valid" | "sufficient"> }) {
  if (row.gap === null) return <span className="text-muted">–</span>;
  return (
    <span className={row.sufficient ? "" : "text-muted"}>
      <span className="font-semibold tabular-nums">{pct(row.gap)}</span>
      <span className="ml-1 whitespace-nowrap text-[12px] tabular-nums text-muted">({pctRange(row.ci)})</span>
      {!row.sufficient && <span className="ml-1.5 inline-block align-middle"><StatusPill tone="warn" dot={false} title="Jawaban sah kurang dari batas minimum untuk analisis agregat. Laporan individual tetap ditindaklanjuti.">Data belum cukup</StatusPill></span>}
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

/** Kepala kolom tabel; `num` menyelaraskan angka ke kanan. */
export function Th({ children, className = "", title, num: right = false }: { children: ReactNode; className?: string; title?: string; num?: boolean }) {
  return <th title={title} scope="col" className={`px-4 py-2.5 ${right ? "text-right" : "text-left"} ${className}`}>{children}</th>;
}

export const VERDICT: Record<BeforeAfter["verdict"], { label: string; cls: string }> = {
  insufficient: { label: "Data belum cukup", cls: "bg-warn-soft text-warn ring-1 ring-inset ring-warn/15" },
  distinct_lower: { label: "Lebih rendah setelah tindakan (interval tidak tumpang tindih)", cls: "bg-ok-soft text-ok ring-1 ring-inset ring-ok/15" },
  distinct_higher: { label: "Lebih tinggi setelah tindakan (interval tidak tumpang tindih)", cls: "bg-danger-soft text-danger ring-1 ring-inset ring-danger/15" },
  indistinct: { label: "Belum dapat dibedakan dari fluktuasi acak", cls: "bg-subtle text-ink-soft ring-1 ring-inset ring-line" },
  not_resolved: { label: "Tindakan belum selesai dikerjakan", cls: "bg-info-soft text-info ring-1 ring-inset ring-info/15" },
};

export function MiniStat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <Metric label={label} value={value} hint={hint} />;
}

export { Link, num };
