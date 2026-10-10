"use client";

import { useState } from "react";
import { Field, Msg, api, btn, input, primary, useAct } from "./kit";

export interface Option { value: string; label: string }

/** Aksi petugas pada satu baris pemilahan pending. Server menolak bila peran tidak berwenang. */
export function PendingStaffActions({ id, category, status, categories, canManage }: { id: string; category: string; status: string; categories: Option[]; canManage: boolean }) {
  const a = useAct();
  const [cat, setCat] = useState(category);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [why, setWhy] = useState("");
  const closed = status === "resolved" || status === "escalated_to_case";
  if (!canManage) return <p className="text-sm text-ink-soft">Peran ini hanya dapat melihat. Pemilahan dikelola verifikator, reviewer, dan admin.</p>;
  if (closed) return <p className="text-sm text-ink-soft">Baris ini sudah {status === "resolved" ? "diselesaikan" : "dipindahkan ke ruang kasus"}. Riwayatnya ada di jejak audit.</p>;
  return (
    <div className="space-y-5">
      <section aria-labelledby="recl" className="space-y-2">
        <h3 id="recl" className="text-sm font-semibold">Ubah kategori penanganan</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Kategori" id="cat"><select id="cat" value={cat} onChange={(e) => setCat(e.target.value)} className={input}>{categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
          <Field label="Alasan (min. 10 karakter)" id="reason"><input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className={input} /></Field>
        </div>
        <button type="button" className={btn} disabled={a.busy || cat === category} onClick={() => a.act(() => api(`/api/pending/${id}`, "POST", { action: "reclassify", category: cat, reason }), { success: "Kategori diubah dan tercatat di audit." })}>Simpan kategori</button>
      </section>
      <section aria-labelledby="solv" className="space-y-2">
        <h3 id="solv" className="text-sm font-semibold">Tandai selesai</h3>
        <Field label="Catatan penyelesaian (min. 10 karakter)" id="note"><input id="note" value={note} onChange={(e) => setNote(e.target.value)} className={input} /></Field>
        <button type="button" className={primary} disabled={a.busy} onClick={() => a.act(() => api(`/api/pending/${id}`, "POST", { action: "resolve", note }), { success: "Ditandai selesai." })}>Selesaikan</button>
        <p className="text-xs text-muted">Menandai selesai hanya mencatat pemilahan. Status klaim di sumber tidak diubah oleh SEHATI.</p>
      </section>
      {category === "needs_review" && (
        <section aria-labelledby="esc" className="space-y-2">
          <h3 id="esc" className="text-sm font-semibold">Pindahkan ke ruang kasus</h3>
          <Field label="Alasan pemindahan (min. 15 karakter)" id="why" hint="Hasilnya berupa sinyal untuk ditinjau di ruang kasus. Bukan dugaan pelanggaran dan bukan putusan."><textarea id="why" value={why} onChange={(e) => setWhy(e.target.value)} rows={2} className={input} /></Field>
          <button type="button" className={btn} disabled={a.busy} onClick={() => a.act(() => api(`/api/pending/${id}`, "POST", { action: "escalate", reason: why }), { success: "Dipindahkan ke ruang kasus." })}>Pindahkan ke kasus</button>
        </section>
      )}
      <Msg msg={a.msg} ok={a.ok} />
    </div>
  );
}

/** Panel untuk faskes (dipakai portal faskes): menjawab pending dan membantah kategori. Memanggil API dengan ?as=faskes. */
export function PendingFaskesPanel({ id, documents }: { id: string; documents: Option[] }) {
  const a = useAct();
  const [text, setText] = useState("");
  const [doc, setDoc] = useState("");
  const [dispute, setDispute] = useState("");
  return (
    <div className="space-y-5">
      <section aria-labelledby="resp" className="space-y-2">
        <h3 id="resp" className="text-sm font-semibold">Jawaban faskes</h3>
        <Field label="Jawaban atau penjelasan" id="resp-text"><textarea id="resp-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} className={input} /></Field>
        {documents.length > 0 && (
          <Field label="Lampirkan dokumen bukti (opsional)" id="resp-doc"><select id="resp-doc" value={doc} onChange={(e) => setDoc(e.target.value)} className={input}><option value="">Tanpa lampiran</option>{documents.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></Field>
        )}
        <button type="button" className={primary} disabled={a.busy} onClick={() => a.act(() => api(`/api/pending/${id}?as=faskes`, "POST", { action: "respond", text, documentId: doc || undefined }), { success: "Jawaban terkirim.", done: () => setText("") })}>Kirim jawaban</button>
      </section>
      <section aria-labelledby="disp" className="space-y-2">
        <h3 id="disp" className="text-sm font-semibold">Bantah kategori</h3>
        <Field label="Alasan bantahan (min. 15 karakter)" id="disp-text"><textarea id="disp-text" rows={2} value={dispute} onChange={(e) => setDispute(e.target.value)} className={input} /></Field>
        <button type="button" className={btn} disabled={a.busy} onClick={() => a.act(() => api(`/api/pending/${id}?as=faskes`, "POST", { action: "dispute", text: dispute }), { success: "Bantahan diajukan.", done: () => setDispute("") })}>Ajukan bantahan</button>
      </section>
      <Msg msg={a.msg} ok={a.ok} />
    </div>
  );
}

export function SyncPendingButton() {
  const a = useAct();
  return (
    <div>
      <button type="button" className={btn} disabled={a.busy} onClick={() => a.act(() => api<{ created: number; closed: number }>("/api/pending/sync", "POST"), { success: "Pemilahan disinkronkan." })}>Sinkronkan pemilahan</button>
      <Msg msg={a.msg} ok={a.ok} />
    </div>
  );
}

/** Peninjau menjawab bantahan (kategori pending atau kartu). */
export function DisputeResolveForm({ id, kind, categories }: { id: string; kind: string; categories: Option[] }) {
  const a = useAct();
  const [outcome, setOutcome] = useState("noted");
  const [response, setResponse] = useState("");
  const [cat, setCat] = useState(categories[0]?.value ?? "");
  return (
    <div className="space-y-2 rounded-lg border border-line p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Hasil" id={`o-${id}`}>
          <select id={`o-${id}`} value={outcome} onChange={(e) => setOutcome(e.target.value)} className={input}>
            <option value="noted">Dicatat tanpa perubahan</option>
            <option value="accepted">Diterima{kind === "card" ? " (ditandai untuk ditinjau ulang)" : ""}</option>
            <option value="rejected">Ditolak</option>
          </select>
        </Field>
        {kind === "pending_category" && outcome === "accepted" && (
          <Field label="Kategori baru" id={`c-${id}`}><select id={`c-${id}`} value={cat} onChange={(e) => setCat(e.target.value)} className={input}>{categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
        )}
      </div>
      <Field label="Jawaban kepada faskes (min. 10 karakter)" id={`r-${id}`}><textarea id={`r-${id}`} rows={2} value={response} onChange={(e) => setResponse(e.target.value)} className={input} /></Field>
      <button type="button" className={primary} disabled={a.busy} onClick={() => a.act(() => api(`/api/disputes/${id}`, "POST", { outcome, response, newCategory: outcome === "accepted" && kind === "pending_category" ? cat : undefined }), { success: "Bantahan dijawab." })}>Kirim jawaban</button>
      <Msg msg={a.msg} ok={a.ok} />
    </div>
  );
}
