"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/m/api";

export interface CfgView {
  version: number; prompt_version: string; mode_pref: "auto" | "simulated" | "live"; model: string; timeout_ms: number; max_retries: number;
  budget_core: number; budget_clarif: number; budget_latency_ms: number; bank_mode: "fixed" | "adaptive_clarify";
}
const btn = "rounded-lg border border-line bg-card px-3 py-1.5 text-sm font-semibold hover:border-ink/40 disabled:opacity-50";
const primary = "rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50";
const input = "mt-1 block w-full rounded-lg border border-line bg-card px-3 py-2 text-sm";

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
    <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-medium text-ink-soft">Versi prompt
        <select value={c.prompt_version} onChange={(e) => setC({ ...c, prompt_version: e.target.value })} className={input}>{prompts.map((p) => <option key={p.version} value={p.version}>{p.version} · {p.title}</option>)}</select>
      </label>
      <label className="text-xs font-medium text-ink-soft">Mode
        <select value={c.mode_pref} onChange={(e) => setC({ ...c, mode_pref: e.target.value as CfgView["mode_pref"] })} className={input}>
          <option value="auto">Otomatis (langsung bila kunci ada, selain itu simulasi)</option><option value="simulated">Selalu simulasi</option><option value="live">Langsung (fallback bila gagal)</option>
        </select>
      </label>
      <label className="text-xs font-medium text-ink-soft">Model
        <input value={c.model} onChange={(e) => setC({ ...c, model: e.target.value })} className={input} />
      </label>
      <label className="text-xs font-medium text-ink-soft">Mode bank
        <select value={c.bank_mode} onChange={(e) => setC({ ...c, bank_mode: e.target.value as CfgView["bank_mode"] })} className={input}>
          <option value="fixed">Tetap (hanya pertanyaan bank, urutan oleh aturan)</option><option value="adaptive_clarify">Adaptif (boleh klarifikasi dari bank)</option>
        </select>
      </label>
      <label className="text-xs font-medium text-ink-soft">Batas waktu panggilan (ms)<input type="number" value={c.timeout_ms} onChange={num("timeout_ms")} className={input} /></label>
      <label className="text-xs font-medium text-ink-soft">Pengulangan maksimum<input type="number" value={c.max_retries} onChange={num("max_retries")} className={input} /></label>
      <label className="text-xs font-medium text-ink-soft">Anggaran pertanyaan inti<input type="number" value={c.budget_core} onChange={num("budget_core")} className={input} /></label>
      <label className="text-xs font-medium text-ink-soft">Anggaran klarifikasi<input type="number" value={c.budget_clarif} onChange={num("budget_clarif")} className={input} /></label>
      <label className="text-xs font-medium text-ink-soft">Anggaran latensi per giliran (ms)<input type="number" value={c.budget_latency_ms} onChange={num("budget_latency_ms")} className={input} /></label>
      <label className="text-xs font-medium text-ink-soft sm:col-span-2">Alasan perubahan (wajib)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={input} />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={busy || note.trim().length < 5} className={primary}>Simpan sebagai versi baru</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
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
    <span className="flex flex-wrap items-center gap-2">
      <input aria-label="Alasan pengaktifan" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Alasan (min. 5 karakter)" className="rounded-lg border border-line px-2 py-1 text-sm" />
      <button type="button" onClick={go} disabled={note.trim().length < 5} className={primary}>Aktifkan</button>
      <button type="button" onClick={() => setOpen(false)} className={btn}>Batal</button>
      {err && <span role="alert" className="text-sm text-danger">{err}</span>}
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
    <div className="space-y-2">
      <button type="button" onClick={go} disabled={busy} className={btn}>{busy ? "Menguji…" : "Uji koneksi"}</button>
      {res && <p role="status" className="text-sm">{res.ok ? "Berhasil" : "Gagal"} · mode {res.mode}{res.latency_ms != null ? ` · ${res.latency_ms} ms` : ""}{res.detail ? ` · ${res.detail}` : ""}</p>}
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
    </div>
  );
}
