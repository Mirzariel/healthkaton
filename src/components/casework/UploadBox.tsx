"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { btnPrimary } from "./CommandForm";

const KIND_NOTE: Record<string, string> = {
  text_extracted: "Teks berhasil dibaca dan menunggu telaah petugas.",
  needs_manual_transcription: "Berkas berupa pindaian atau gambar. Sistem tidak memakai OCR, sehingga petugas akan mentranskripsikannya secara manual.",
};

/** Unggah dokumen bukti. Jenis berkas ditentukan server dari isinya; batas 3 MB. */
export function UploadBox({ endpoint, hidden = {}, label = "Lampirkan dokumen", onDoneId }: { endpoint: string; hidden?: Record<string, string>; label?: string; onDoneId?: string }) {
  const router = useRouter();
  const uid = useId();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    for (const [k, v] of Object.entries(hidden)) fd.set(k, v);
    const f = fd.get("file");
    if (!(f instanceof File) || !f.size) return setErr("Pilih berkas terlebih dahulu.");
    if (f.size > 3 * 1024 * 1024) return setErr("Berkas terlalu besar (maks. 3 MB).");
    setBusy(true);
    setErr(null);
    setDone(null);
    try {
      const r = await fetch(endpoint, { method: "POST", body: fd });
      const j = (await r.json()) as { ok: boolean; error?: string; data?: { id: string; status: string } };
      if (!j.ok) return setErr(j.error ?? "Unggahan gagal.");
      setDone(`Tersimpan sebagai ${j.data!.id}. ${KIND_NOTE[j.data!.status] ?? ""}`.trim());
      form.reset();
      router.refresh();
    } catch {
      setErr("Tidak dapat menghubungi server.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="space-y-2" id={onDoneId}>
      <label htmlFor={`${uid}-f`} className="block text-xs font-medium text-ink-soft">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <input id={`${uid}-f`} name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain" className="max-w-full text-sm" />
        <button type="submit" disabled={busy} className={btnPrimary}>{busy ? "Mengunggah…" : "Unggah"}</button>
      </div>
      <p className="text-xs text-muted">PDF, PNG, JPEG, atau teks biasa, maksimal 3 MB. Jenis berkas diperiksa dari isinya.</p>
      {done && <p role="status" className="text-sm text-ok">{done}</p>}
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
    </form>
  );
}
