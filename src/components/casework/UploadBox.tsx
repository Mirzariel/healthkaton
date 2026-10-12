"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { FilePicker } from "@/components/FilePicker";
import { btnSecondary } from "./CommandForm";

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
    <form onSubmit={onSubmit} className="space-y-2.5" id={onDoneId}>
      <label htmlFor={`${uid}-f`} className="field-label">{label}</label>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line-strong bg-subtle/50 p-3">
        <FilePicker id={`${uid}-f`} name="file" accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain" />
        <button type="submit" disabled={busy} className={`${btnSecondary} btn-sm`}>{busy ? "Mengunggah…" : "Unggah"}</button>
      </div>
      <p className="field-hint">PDF, PNG, JPEG, atau teks biasa, maksimal 3 MB. Jenis berkas diperiksa dari isinya.</p>
      {done && <p role="status" className="text-[13px] font-medium text-ok">{done}</p>}
      {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
    </form>
  );
}
