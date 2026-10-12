"use client";

import { useState } from "react";
import { api } from "@/components/m/api";
import { AiModeBadge, Card, CardHeader, Notice, Pill, StatusPill, Toolbar } from "@/components/ui";
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
    <div className="space-y-5">
      <Toolbar>
        <div className="min-w-0 flex-1 basis-72">
          <label htmlFor="sum-finding" className="field-label">Temuan</label>
          <select id="sum-finding" value={id} onChange={(e) => { setId(e.target.value); setRes(null); }} className="field">{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        </div>
        <button type="button" onClick={go} disabled={busy || !id} className="btn btn-primary w-full sm:w-auto">{busy ? "Menyusun…" : "Susun draf ringkasan"}</button>
        {err && <p role="alert" className="w-full text-[13px] text-danger">{err}</p>}
      </Toolbar>
      {res && (
        <div className="space-y-4" aria-live="polite">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink">Draf ringkasan untuk {res.input.finding.title}</h2>
            <AiModeBadge mode={res.mode} />
            <StatusPill tone="warn">draf, bukan keputusan</StatusPill>
          </div>
          {res.fallback_reason && <Notice tone="warn">Fallback: {res.fallback_reason}</Notice>}
          {res.issues.length > 0 && <Notice tone="neutral">Catatan validator: {res.issues.join("; ")}</Notice>}
          <div className="grid gap-4 lg:grid-cols-2">
            {SUMMARY_KINDS.map((k) => {
              const items = res.summary.items.filter((i) => i.kind === k);
              if (!items.length) return null;
              return (
                <Card key={k}>
                  <CardHeader title={SUMMARY_KIND_LABEL[k]} />
                  <ul className="divide-y divide-line">
                    {items.map((it, i) => (
                      <li key={i} className="px-5 py-3 text-[14px] leading-relaxed text-ink">
                        {it.text}
                        <span className="mt-1.5 flex flex-wrap gap-1">{it.refs.map((r) => <Pill key={r} className={`font-mono text-[11px] ${TONE_CLASS.muted}`} title={src.get(r)?.text}>{r}</Pill>)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
          <Card>
            <CardHeader title="Batas kesimpulan" />
            <ul className="list-disc space-y-1.5 px-5 py-4 pl-9 text-[13.5px] leading-relaxed text-ink-soft">{res.summary.limits.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </Card>
          <p className="text-[12.5px] text-muted">Pemanggilan <span className="font-mono">{res.invocation_id}</span>. Rujukan (ref) hanya berasal dari data kasus; arahkan kursor pada rujukan untuk melihat teks sumbernya.</p>
        </div>
      )}
    </div>
  );
}
