"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function call(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return (await r.json()) as { ok: boolean; error?: string; data?: Record<string, unknown> };
}

const btn = "rounded-lg border border-line bg-card px-3 py-1.5 text-sm font-semibold hover:border-ink/40 disabled:opacity-50";
const primary = "rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50";

export function TransitionBox({ id, options }: { id: string; options: { to: string; label: string }[] }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!options.length) return <p className="text-sm text-ink-soft">Tidak ada transisi yang tersedia untuk peran Anda pada status ini.</p>;
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
    <div className="space-y-2">
      <label className="block text-xs font-medium text-ink-soft" htmlFor="tnote">Catatan keputusan (wajib, minimal 5 karakter)</label>
      <textarea id="tnote" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o.to} type="button" disabled={busy} onClick={() => go(o.to)} className={o.to === "approved" || o.to === "reviewed" ? primary : btn}>{o.label}</button>
        ))}
      </div>
      {msg && <p role="alert" className="text-sm text-danger">{msg}</p>}
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
  if (!open) return <span>{text} <button type="button" onClick={() => setOpen(true)} className="ml-1 text-xs font-semibold text-brand underline underline-offset-2">ubah</button></span>;
  return (
    <span className="block space-y-1.5">
      <textarea aria-label="Kalimat pertanyaan" value={val} onChange={(e) => setVal(e.target.value)} rows={2} className="w-full rounded-lg border border-line px-2 py-1.5 text-sm" />
      <span className="flex gap-2"><button type="button" onClick={save} className={primary}>Simpan</button><button type="button" onClick={() => { setOpen(false); setVal(text); }} className={btn}>Batal</button></span>
      {msg && <span role="alert" className="block text-xs text-danger">{msg}</span>}
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
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="nv" className="block text-xs font-medium text-ink-soft">Nomor versi draft baru</label>
        <input id="nv" value={v} onChange={(e) => setV(e.target.value)} placeholder="mis. 1.1" className="rounded-lg border border-line px-3 py-1.5 text-sm" />
      </div>
      <button type="button" onClick={go} disabled={!v} className={btn}>Salin menjadi draft</button>
      {msg && <p role="alert" className="w-full text-sm text-danger">{msg}</p>}
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
      <label htmlFor="imp" className="block text-sm font-medium">Tempel JSON standar (satu standar, banyak butir)</label>
      <textarea id="imp" value={txt} onChange={(e) => setTxt(e.target.value)} rows={8} spellCheck={false} className="w-full rounded-lg border border-line px-3 py-2 font-mono text-xs" />
      <div className="flex gap-2">
        <button type="button" onClick={() => go(true)} disabled={!txt.trim()} className={btn}>Periksa (pratinjau)</button>
        <button type="button" onClick={() => go(false)} disabled={!txt.trim()} className={primary}>Impor sebagai draft</button>
      </div>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      {res && (
        <div role="status" className="rounded-lg border border-line p-3 text-sm">
          <p className="font-semibold">{res.applied ? `Diimpor: ${res.note ?? ""}` : res.ok ? "Lolos validasi (belum ditulis)." : "Ada galat validasi."} {res.summary && `${res.summary.id} · ${res.summary.indikator} butir`}</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {res.issues.slice(0, 30).map((i, k) => <li key={k} className={i.level === "error" ? "text-danger" : "text-warn"}><span className="font-mono text-xs">{i.where}</span>: {i.message}</li>)}
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
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => go(false)} className={primary}>Verifikasi rantai sekarang</button>
        <button type="button" disabled={busy} onClick={() => go(true)} className={btn}>Tulis jangkar lalu verifikasi</button>
      </div>
      {msg && <p role="status" className="text-sm text-ink-soft">{msg}</p>}
    </div>
  );
}
