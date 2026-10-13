"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Notice } from "@/components/ui";

async function call(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return (await r.json()) as { ok: boolean; error?: string; data?: Record<string, unknown> };
}

const btn = "btn btn-secondary btn-sm";
const primary = "btn btn-primary btn-sm";

export function TransitionBox({ id, options }: { id: string; options: { to: string; label: string }[] }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!options.length) return <p className="text-body-sm leading-relaxed text-ink-soft">Tidak ada transisi yang tersedia untuk peran Anda pada status ini.</p>;
  async function go(to: string) {
    setBusy(true);
    setMsg(null);
    const j = await call(`/api/standards/${encodeURIComponent(id)}/transition`, "POST", { to, note });
    setBusy(false);
    if (!j.ok) return setMsg(j.error ?? "Gagal.");
    setNote("");
    router.refresh();
  }
  return (
    <div className="space-y-3">
      <div>
        <label className="field-label" htmlFor="tnote">Catatan keputusan</label>
        <textarea id="tnote" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="field" />
        <p className="field-hint">Wajib, minimal 5 karakter.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o.to} type="button" disabled={busy} onClick={() => go(o.to)} className={o.to === "approved" || o.to === "reviewed" ? primary : btn}>{o.label}</button>
        ))}
      </div>
      {msg && <p role="alert" className="text-caption text-danger">{msg}</p>}
    </div>
  );
}

export function QuestionEditor({ id, text, editable }: { id: string; text: string; editable: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(text);
  const [msg, setMsg] = useState<string | null>(null);
  if (!editable) return <span>{text}</span>;
  async function save() {
    const j = await call(`/api/standards/questions/${encodeURIComponent(id)}`, "PATCH", { text: val });
    if (!j.ok) return setMsg(j.error ?? "Gagal.");
    setOpen(false);
    setMsg(null);
    router.refresh();
  }
  if (!open) return <span>{text} <button type="button" onClick={() => setOpen(true)} className="link ml-1 text-caption">ubah</button></span>;
  return (
    <span className="block space-y-2">
      <textarea aria-label="Kalimat pertanyaan" value={val} onChange={(e) => setVal(e.target.value)} rows={2} className="field" />
      <span className="flex gap-2"><button type="button" onClick={save} className={primary}>Simpan</button><button type="button" onClick={() => { setOpen(false); setVal(text); }} className={btn}>Batal</button></span>
      {msg && <span role="alert" className="block text-caption text-danger">{msg}</span>}
    </span>
  );
}

export function NewDraftBox({ id }: { id: string }) {
  const router = useRouter();
  const [v, setV] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  async function go() {
    const j = await call(`/api/standards/${encodeURIComponent(id)}/draft`, "POST", { version: v });
    if (!j.ok) return setMsg(j.error ?? "Gagal.");
    router.push(`/console/standards/${encodeURIComponent(String(j.data?.id))}`);
  }
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="nv" className="field-label">Nomor versi draft baru</label>
        <input id="nv" value={v} onChange={(e) => setV(e.target.value)} placeholder="mis. 1.1" className="field" />
      </div>
      <button type="button" onClick={go} disabled={!v} className={btn}>Salin menjadi draft</button>
      {msg && <p role="alert" className="text-caption text-danger">{msg}</p>}
    </div>
  );
}

interface Issue { level: string; where: string; message: string }
export function ImportBox() {
  const router = useRouter();
  const [txt, setTxt] = useState("");
  const [res, setRes] = useState<{ issues: Issue[]; summary: { id: string; indikator: number } | null; ok: boolean; applied?: boolean; note?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function go(dryRun: boolean) {
    setErr(null);
    const j = await call("/api/standards/import", "POST", { json: txt, dryRun });
    if (!j.ok) return setErr(j.error ?? "Gagal.");
    setRes(j.data as never);
    if (!dryRun && j.data?.applied) router.refresh();
  }
  return (
    <div className="space-y-3">
      <label htmlFor="imp" className="field-label">Tempel JSON standar (satu standar, banyak butir)</label>
      <textarea id="imp" value={txt} onChange={(e) => setTxt(e.target.value)} rows={8} spellCheck={false} className="field font-mono text-code" />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => go(true)} disabled={!txt.trim()} className="btn btn-secondary">Periksa (pratinjau)</button>
        <button type="button" onClick={() => go(false)} disabled={!txt.trim()} className="btn btn-primary">Impor sebagai draft</button>
      </div>
      {err && <Notice tone="danger"><span role="alert">{err}</span></Notice>}
      {res && (
        <div role="status" className="rounded-lg border border-line bg-subtle/50 p-3.5 text-body-sm">
          <p className="font-semibold text-ink">{res.applied ? `Diimpor: ${res.note ?? ""}` : res.ok ? "Lolos validasi (belum ditulis)." : "Ada galat validasi."} {res.summary && `${res.summary.id} · ${res.summary.indikator} butir`}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {res.issues.slice(0, 30).map((i, k) => <li key={k} className={i.level === "error" ? "text-danger" : "text-warn"}><span className="font-mono text-code">{i.where}</span>: {i.message}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export function VerifyBox() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function go(anchor: boolean) {
    setBusy(true);
    const j = await call("/api/audit/verify", "POST", { anchor });
    setBusy(false);
    if (!j.ok) return setMsg(j.error ?? "Gagal.");
    const c = j.data?.check as { message: string };
    setMsg(c.message);
    router.refresh();
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => go(false)} className="btn btn-primary">{busy ? "Memverifikasi…" : "Verifikasi rantai sekarang"}</button>
        <button type="button" disabled={busy} onClick={() => go(true)} className="btn btn-secondary">Tulis jangkar lalu verifikasi</button>
      </div>
      {msg && <Notice tone="neutral"><span role="status">{msg}</span></Notice>}
    </div>
  );
}
