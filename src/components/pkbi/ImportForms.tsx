"use client";

import { useState } from "react";
import { Field, Msg, api, btn, input, primary, useAct } from "./kit";

export interface KindOption { value: string; label: string; format: string }

/** Langkah 1: pilih jenis, unggah berkas atau tempel teks → pratinjau (belum menulis data). */
export function ImportUpload({ kinds }: { kinds: KindOption[] }) {
  const a = useAct();
  const [kind, setKind] = useState(kinds[0]?.value ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  async function submit() {
    const req = () => {
      if (file) {
        const f = new FormData();
        f.set("kind", kind);
        f.set("file", file);
        return api<{ jobId: string }>("/api/import", "POST", f);
      }
      return api<{ jobId: string }>("/api/import", "POST", { kind, text });
    };
    await a.act(req, { refresh: false, done: (d) => d && a.router.push(`/console/import?job=${d.jobId}`) });
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Jenis data" id="imp-kind"><select id="imp-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={input}>{kinds.map((k) => <option key={k.value} value={k.value}>{k.label} ({k.format.toUpperCase()})</option>)}</select></Field>
        <Field label="Berkas (maks. 1 MB)" id="imp-file" hint="Atau tempel isinya di bawah."><input id="imp-file" type="file" accept=".csv,.json,.txt,text/csv,application/json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={input} /></Field>
      </div>
      {!file && <Field label="Isi berkas (tempel)" id="imp-text"><textarea id="imp-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} className={`${input} font-mono text-xs`} spellCheck={false} /></Field>}
      <button type="button" className={primary} disabled={a.busy || (!file && !text.trim())} onClick={submit}>Periksa dulu (pratinjau)</button>
      <p className="text-xs text-muted">Pratinjau tidak menyimpan data apa pun. Data baru masuk setelah Anda menerapkannya pada langkah berikutnya.</p>
      <Msg msg={a.msg} ok={a.ok} />
    </div>
  );
}

/** Langkah 2: terapkan pratinjau. Bila ada baris bergalat, hanya baris valid yang masuk dan harus dikonfirmasi. */
export function ApplyBox({ jobId, errors, fresh }: { jobId: string; errors: number; fresh: number }) {
  const a = useAct();
  const [confirm, setConfirm] = useState(false);
  const blocked = fresh === 0;
  return (
    <div className="space-y-2">
      {errors > 0 && (
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-1" /> Saya paham {errors} baris bergalat akan dilewati dan hanya {fresh} baris valid yang diterapkan.</label>
      )}
      <button type="button" className={primary} disabled={a.busy || blocked || (errors > 0 && !confirm)} onClick={() => a.act(() => api(`/api/import/${jobId}/apply`, "POST", { allowPartial: errors > 0 && confirm }), { success: "Data diterapkan." })}>Terapkan {fresh} baris</button>
      {blocked && <p className="text-sm text-ink-soft">Tidak ada baris baru yang valid, jadi tidak ada yang dapat diterapkan.</p>}
      <button type="button" className={`${btn} ml-2`} onClick={() => a.router.push("/console/import")}>Kembali</button>
      <Msg msg={a.msg} ok={a.ok} />
    </div>
  );
}
