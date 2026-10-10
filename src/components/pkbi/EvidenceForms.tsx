"use client";

import { useState } from "react";
import { Field, Msg, api, btn, input, primary, useAct } from "./kit";
import type { Option } from "./PendingForms";

/** Unggah dokumen bukti (PDF/PNG/JPEG, maks. 4 MB). `surface` = "faskes" dipakai portal faskes. Server memeriksa isi berkas, bukan hanya ekstensinya. */
export function UploadForm({ episodes, fixedEpisode, surface }: { episodes: Option[]; fixedEpisode?: string; surface?: "faskes" }) {
  const a = useAct();
  const [file, setFile] = useState<File | null>(null);
  const [episode, setEpisode] = useState(fixedEpisode ?? "");
  const [status, setStatus] = useState<string | null>(null);
  async function submit() {
    if (!file) return;
    const f = new FormData();
    f.set("file", file);
    if (episode) f.set("episodeId", episode);
    await a.act(() => api<{ id: string; created: boolean; status: string }>(`/api/evidence/documents${surface ? `?as=${surface}` : ""}`, "POST", f), {
      success: "Dokumen tersimpan.",
      done: (d) => { setStatus(d ? `${d.created ? "Dokumen baru" : "Dokumen identik sudah ada, tidak digandakan"} (${d.id}).` : null); setFile(null); },
    });
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {!fixedEpisode && <Field label="Episode terkait" id="up-ep" hint="Wajib untuk menentukan faskes pemilik dokumen."><select id="up-ep" value={episode} onChange={(e) => setEpisode(e.target.value)} className={input}><option value="">Pilih episode</option>{episodes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>}
        <Field label="Berkas (PDF, PNG, atau JPEG; maks. 4 MB)" id="up-file"><input id="up-file" type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={input} /></Field>
      </div>
      <button type="button" className={primary} disabled={a.busy || !file || !episode} onClick={submit}>{a.busy ? "Mengunggah dan memproses…" : "Unggah"}</button>
      {status && <p className="text-sm text-ink-soft">{status}</p>}
      <Msg msg={a.msg} ok={a.ok} />
    </div>
  );
}

/** Memproses ulang dokumen yang belum punya usulan teks (mis. setelah mesin OCR dipasang). */
export function ProcessButton({ id }: { id: string }) {
  const a = useAct();
  return (
    <div>
      <button type="button" className={btn} disabled={a.busy} onClick={() => a.act(() => api(`/api/evidence/documents/${id}/process`, "POST"), { success: "Diproses ulang." })}>Proses ulang</button>
      <Msg msg={a.msg} ok={a.ok} />
    </div>
  );
}

/** Editor transkripsi manual untuk dokumen tanpa lapisan teks. Hasilnya usulan yang harus dikonfirmasi orang lain. */
export function TranscribeEditor({ id, pageCount, surface }: { id: string; pageCount: number; surface?: "faskes" }) {
  const a = useAct();
  const pages = Math.max(1, Math.min(pageCount, 50));
  const [texts, setTexts] = useState<string[]>(() => Array.from({ length: pages }, () => ""));
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">Ketik isi dokumen apa adanya per halaman. Hasil ketikan menjadi <strong>usulan</strong> dan baru dipakai sebagai bukti setelah petugas lain mengonfirmasinya.</p>
      {texts.map((t, i) => (
        <Field key={i} label={`Halaman ${i + 1}`} id={`tr-${id}-${i}`}><textarea id={`tr-${id}-${i}`} rows={5} value={t} onChange={(e) => setTexts(texts.map((x, j) => (j === i ? e.target.value : x)))} className={input} /></Field>
      ))}
      <button type="button" className={primary} disabled={a.busy || texts.every((t) => !t.trim())} onClick={() => a.act(() => api(`/api/evidence/documents/${id}/transcribe${surface ? `?as=${surface}` : ""}`, "POST", { pages: texts.map((text, i) => ({ page: i + 1, text })).filter((p) => p.text.trim()) }), { success: "Transkripsi tersimpan sebagai usulan." })}>Simpan transkripsi</button>
      <Msg msg={a.msg} ok={a.ok} />
    </div>
  );
}

/** Peninjau memutuskan satu usulan teks: konfirmasi, koreksi, atau tolak. */
export function ExtractionReview({ id, text, canReview, blockedReason }: { id: string; text: string; canReview: boolean; blockedReason?: string }) {
  const a = useAct();
  const [edited, setEdited] = useState(text);
  if (!canReview) return <p className="text-xs text-muted">Hanya verifikator, reviewer, atau admin yang dapat memutuskan usulan ini.</p>;
  if (blockedReason) return <p className="text-xs text-warn">{blockedReason}</p>;
  const send = (action: string) => a.act(() => api(`/api/evidence/extractions/${id}`, "PATCH", { action, correctedText: action === "correct" ? edited : undefined }), { success: "Keputusan tercatat." });
  return (
    <div className="space-y-2">
      <textarea aria-label="Teks yang dikoreksi" rows={4} value={edited} onChange={(e) => setEdited(e.target.value)} className={`${input} font-mono text-xs`} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={a.busy} onClick={() => send("confirm")}>Konfirmasi apa adanya</button>
        <button type="button" className={btn} disabled={a.busy || edited.trim() === text.trim()} onClick={() => send("correct")}>Simpan koreksi</button>
        <button type="button" className={btn} disabled={a.busy} onClick={() => send("reject")}>Tolak usulan</button>
      </div>
      <Msg msg={a.msg} ok={a.ok} />
    </div>
  );
}
