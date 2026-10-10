"use client";

import { useState } from "react";
import { api } from "@/components/m/api";
import { AiModeBadge, Card, Pill } from "@/components/ui";
import type { CaseSummaryResult } from "@/lib/ai/case-summary";
import { SUMMARY_KINDS, SUMMARY_KIND_LABEL } from "@/lib/ai/summary-kinds";
import { TONE_CLASS } from "@/lib/labels";

export interface FindingOption { id: string; label: string }

export function SummaryLab({ options, initial }: { options: FindingOption[]; initial?: string }) {
  const [id, setId] = useState(initial && options.some((o) => o.id === initial) ? initial : options[0]?.id ?? "");
  const [res, setRes] = useState<CaseSummaryResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setErr(null);
    try {
      setRes(await api<CaseSummaryResult>("/api/ai/case-summary", "POST", { finding_id: id }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal membuat ringkasan.");
    }
    setBusy(false);
  }
  const src = new Map((res?.input.sources ?? []).map((s) => [s.ref, s]));
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-64 flex-1 text-xs font-medium text-ink-soft">Temuan
          <select value={id} onChange={(e) => { setId(e.target.value); setRes(null); }} className="mt-1 block w-full rounded-lg border border-line bg-card px-3 py-2 text-sm">{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        </label>
        <button type="button" onClick={go} disabled={busy || !id} className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Menyusun…" : "Susun draf ringkasan"}</button>
        {err && <p role="alert" className="w-full text-sm text-danger">{err}</p>}
      </Card>
      {res && (
        <div className="space-y-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <strong>Draf ringkasan untuk {res.input.finding.title}</strong>
            <AiModeBadge mode={res.mode} />
            <Pill className={TONE_CLASS.warn}>draf, bukan keputusan</Pill>
          </div>
          {res.fallback_reason && <p className="text-xs text-warn">Fallback: {res.fallback_reason}</p>}
          {res.issues.length > 0 && <p className="text-xs text-ink-soft">Catatan validator: {res.issues.join("; ")}</p>}
          {SUMMARY_KINDS.map((k) => {
            const items = res.summary.items.filter((i) => i.kind === k);
            if (!items.length) return null;
            return (
              <Card key={k} className="p-4">
                <p className="text-sm font-semibold">{SUMMARY_KIND_LABEL[k]}</p>
                <ul className="mt-2 space-y-2 text-sm">
                  {items.map((it, i) => (
                    <li key={i}>
                      {it.text}
                      <span className="mt-0.5 flex flex-wrap gap-1">{it.refs.map((r) => <Pill key={r} className="bg-line font-mono text-[11px] text-ink-soft" title={src.get(r)?.text}>{r}</Pill>)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
          <Card className="p-4"><p className="text-sm font-semibold">Batas kesimpulan</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-soft">{res.summary.limits.map((l, i) => <li key={i}>{l}</li>)}</ul></Card>
          <p className="text-xs text-muted">Pemanggilan {res.invocation_id}. Rujukan (ref) hanya berasal dari data kasus; arahkan kursor pada rujukan untuk melihat teks sumbernya.</p>
        </div>
      )}
    </div>
  );
}
