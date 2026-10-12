"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/m/api";
import { Notice } from "@/components/ui";

export interface CfgView {
  version: number; prompt_version: string; mode_pref: "auto" | "simulated" | "live"; model: string; timeout_ms: number; max_retries: number;
  budget_core: number; budget_clarif: number; budget_latency_ms: number; bank_mode: "fixed" | "adaptive_clarify";
}
const btn = "btn btn-secondary btn-sm";
const primary = "btn btn-primary";

function F({ id, label, hint, children, className = "" }: { id: string; label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export function ConfigForm({ active, prompts }: { active: CfgView; prompts: { version: string; title: string }[] }) {
  const router = useRouter();
  const [c, setC] = useState<CfgView>(active);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const num = (k: keyof CfgView) => (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: Number(e.target.value) });
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const { version } = await api<{ version: number }>("/api/ai/config", "POST", {
        prompt_version: c.prompt_version, mode_pref: c.mode_pref, model: c.model, timeout_ms: c.timeout_ms, max_retries: c.max_retries, budget_core: c.budget_core, budget_clarif: c.budget_clarif, budget_latency_ms: c.budget_latency_ms, bank_mode: c.bank_mode, note,
      });
      setMsg({ ok: true, text: `Versi ${version} disimpan dan diaktifkan. Hanya sesi yang dimulai sesudah ini memakai anggaran baru.` });
      setNote("");
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal menyimpan." });
    }
    setBusy(false);
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="mb-1 text-[13px] font-semibold text-ink">Model dan perilaku</legend>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <F id="cf-prompt" label="Versi prompt">
            <select id="cf-prompt" value={c.prompt_version} onChange={(e) => setC({ ...c, prompt_version: e.target.value })} className="field">{prompts.map((p) => <option key={p.version} value={p.version}>{p.version} · {p.title}</option>)}</select>
          </F>
          <F id="cf-mode" label="Mode">
            <select id="cf-mode" value={c.mode_pref} onChange={(e) => setC({ ...c, mode_pref: e.target.value as CfgView["mode_pref"] })} className="field">
              <option value="auto">Otomatis (langsung bila kunci ada, selain itu simulasi)</option><option value="simulated">Selalu simulasi</option><option value="live">Langsung (fallback bila gagal)</option>
            </select>
          </F>
          <F id="cf-model" label="Model">
            <input id="cf-model" value={c.model} onChange={(e) => setC({ ...c, model: e.target.value })} className="field font-mono text-[13px]" />
          </F>
          <F id="cf-bank" label="Mode bank">
            <select id="cf-bank" value={c.bank_mode} onChange={(e) => setC({ ...c, bank_mode: e.target.value as CfgView["bank_mode"] })} className="field">
              <option value="fixed">Tetap (hanya pertanyaan bank, urutan oleh aturan)</option><option value="adaptive_clarify">Adaptif (boleh klarifikasi dari bank)</option>
            </select>
          </F>
        </div>
      </fieldset>
      <fieldset className="space-y-3 border-t border-line pt-5">
        <legend className="mb-1 text-[13px] font-semibold text-ink">Batas dan anggaran</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-3">
          <F id="cf-timeout" label="Batas waktu panggilan (ms)"><input id="cf-timeout" type="number" value={c.timeout_ms} onChange={num("timeout_ms")} className="field tabular-nums" /></F>
          <F id="cf-retry" label="Pengulangan maksimum"><input id="cf-retry" type="number" value={c.max_retries} onChange={num("max_retries")} className="field tabular-nums" /></F>
          <F id="cf-lat" label="Anggaran latensi per giliran (ms)" className="col-span-2 lg:col-span-1"><input id="cf-lat" type="number" value={c.budget_latency_ms} onChange={num("budget_latency_ms")} className="field tabular-nums" /></F>
          <F id="cf-core" label="Anggaran pertanyaan inti"><input id="cf-core" type="number" value={c.budget_core} onChange={num("budget_core")} className="field tabular-nums" /></F>
          <F id="cf-clarif" label="Anggaran klarifikasi"><input id="cf-clarif" type="number" value={c.budget_clarif} onChange={num("budget_clarif")} className="field tabular-nums" /></F>
        </div>
      </fieldset>
      <div className="space-y-3 border-t border-line pt-5">
        <F id="cf-note" label="Alasan perubahan (wajib)" hint="Minimal 5 karakter. Alasan tercatat bersama versi baru.">
          <textarea id="cf-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="field" />
        </F>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy || note.trim().length < 5} className={primary}>{busy ? "Menyimpan…" : "Simpan sebagai versi baru"}</button>
        </div>
        {msg && <Notice tone={msg.ok ? "ok" : "danger"}><span role={msg.ok ? "status" : "alert"}>{msg.text}</span></Notice>}
      </div>
    </form>
  );
}

export function ActivateButton({ version }: { version: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    try {
      await api(`/api/ai/config/${version}/activate`, "POST", { note });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal.");
    }
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={btn}>Aktifkan kembali</button>;
  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      <input aria-label="Alasan pengaktifan" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Alasan (min. 5 karakter)" className="field !min-h-8 w-52 !py-1 text-[13px]" />
      <button type="button" onClick={go} disabled={note.trim().length < 5} className="btn btn-primary btn-sm">Aktifkan</button>
      <button type="button" onClick={() => setOpen(false)} className={btn}>Batal</button>
      {err && <span role="alert" className="w-full text-right text-[13px] text-danger">{err}</span>}
    </span>
  );
}

export function TestConnection() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; mode: string; detail?: string; latency_ms?: number | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setErr(null);
    try {
      setRes(await api("/api/ai/config/test", "POST", {}));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal.");
    }
    setBusy(false);
  }
  return (
    <div className="space-y-3">
      <button type="button" onClick={go} disabled={busy} className="btn btn-secondary">{busy ? "Menguji…" : "Uji koneksi"}</button>
      {res && <Notice tone={res.ok ? "ok" : "warn"}><span role="status">{res.ok ? "Berhasil" : "Gagal"} · mode {res.mode}{res.latency_ms != null ? ` · ${res.latency_ms} ms` : ""}{res.detail ? ` · ${res.detail}` : ""}</span></Notice>}
      {err && <Notice tone="danger"><span role="alert">{err}</span></Notice>}
    </div>
  );
}
