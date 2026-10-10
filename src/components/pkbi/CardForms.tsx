"use client";

import { useState } from "react";
import { Field, Msg, api, btn, input, primary, useAct } from "./kit";

export interface PolicyForm {
  min_claims: number; min_responses: number; min_peers: number; yellow_ratio: number; red_ratio: number; min_metrics_for_red: number;
  period: "quarter" | "month"; consecutive: number; min_clarifications: number;
  floor: { pending_rate: number; verified_per_100: number; gap_rate: number; lapsed_share: number };
}

export function RecomputeButton() {
  const a = useAct();
  return (
    <div>
      <button type="button" className={btn} disabled={a.busy} onClick={() => a.act(() => api("/api/cards/recompute", "POST"), { success: "Kartu dihitung ulang dari data terkini." })}>Hitung ulang kartu</button>
      <Msg msg={a.msg} ok={a.ok} />
    </div>
  );
}

const num = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(",", ".")));

/** Mengubah ambang membuat versi parameter BARU berstatus draft. Versi lama tidak diubah dan tidak pernah otomatis menjadi "tervalidasi". */
export function PolicyEditor({ initial }: { initial: PolicyForm }) {
  const a = useAct();
  const [v, setV] = useState(() => ({
    min_claims: String(initial.min_claims), min_responses: String(initial.min_responses), min_peers: String(initial.min_peers), yellow_ratio: String(initial.yellow_ratio), red_ratio: String(initial.red_ratio),
    min_metrics_for_red: String(initial.min_metrics_for_red), consecutive: String(initial.consecutive), min_clarifications: String(initial.min_clarifications), period: initial.period,
    f_pending: String(initial.floor.pending_rate), f_verified: String(initial.floor.verified_per_100), f_gap: String(initial.floor.gap_rate), f_lapsed: String(initial.floor.lapsed_share),
  }));
  const [note, setNote] = useState("");
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const field = (k: keyof typeof v, label: string, hint?: string) => (
    <Field label={label} id={`pp-${k}`} hint={hint}><input id={`pp-${k}`} inputMode="decimal" value={v[k]} onChange={set(k)} className={input} /></Field>
  );
  async function save() {
    const params = {
      min_claims: num(v.min_claims), min_responses: num(v.min_responses), min_peers: num(v.min_peers), yellow_ratio: num(v.yellow_ratio), red_ratio: num(v.red_ratio), min_metrics_for_red: num(v.min_metrics_for_red),
      period: v.period, consecutive: num(v.consecutive), min_clarifications: num(v.min_clarifications),
      floor: { pending_rate: num(v.f_pending), verified_per_100: num(v.f_verified), gap_rate: num(v.f_gap), lapsed_share: num(v.f_lapsed) },
    };
    await a.act(() => api("/api/cards/policy", "POST", { params, note }), { success: "Versi parameter baru (draft) dibuat dan kartu dihitung ulang." });
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {field("min_claims", "Minimum klaim per periode")}
        {field("min_responses", "Minimum responden survei")}
        {field("min_clarifications", "Minimum klarifikasi")}
        {field("min_peers", "Minimum faskes sejawat")}
        {field("yellow_ratio", "Rasio kuning (× pembanding)")}
        {field("red_ratio", "Rasio merah (× pembanding)")}
        {field("min_metrics_for_red", "Metrik 'tinggi' untuk merah")}
        {field("consecutive", "Periode berturut-turut", "1 = tidak disyaratkan")}
        {field("f_pending", "Lantai tingkat pending", "0,05 = 5%")}
        {field("f_gap", "Lantai gap laporan")}
        {field("f_lapsed", "Lantai klarifikasi lewat tenggat")}
        {field("f_verified", "Lantai terbukti per 100 klaim")}
        <Field label="Periode" id="pp-period"><select id="pp-period" value={v.period} onChange={set("period")} className={input}><option value="quarter">Kuartal</option><option value="month">Bulan</option></select></Field>
      </div>
      <Field label="Alasan perubahan (min. 10 karakter)" id="pp-note"><input id="pp-note" value={note} onChange={(e) => setNote(e.target.value)} className={input} /></Field>
      <button type="button" className={primary} disabled={a.busy} onClick={save}>Simpan sebagai versi draft baru</button>
      <Msg msg={a.msg} ok={a.ok} />
    </div>
  );
}

/** Dipakai portal faskes: faskes membantah kartu miliknya. */
export function CardDisputeForm({ cardId }: { cardId: number }) {
  const a = useAct();
  const [text, setText] = useState("");
  return (
    <div className="space-y-2">
      <Field label="Alasan bantahan (min. 15 karakter)" id={`cd-${cardId}`}><textarea id={`cd-${cardId}`} rows={2} value={text} onChange={(e) => setText(e.target.value)} className={input} /></Field>
      <button type="button" className={btn} disabled={a.busy} onClick={() => a.act(() => api("/api/cards/dispute", "POST", { cardId, text }), { success: "Bantahan diajukan.", done: () => setText("") })}>Ajukan bantahan</button>
      <Msg msg={a.msg} ok={a.ok} />
    </div>
  );
}
