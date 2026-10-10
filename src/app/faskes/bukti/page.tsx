import { UploadBox } from "@/components/casework/UploadBox";
import { Tag } from "@/components/casework/parts";
import { Card, EmptyState, Forbidden, PageHeader, SectionTitle } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { facilityClarifications, facilityDocuments } from "@/lib/casework/queries";
import { fmtDateTime } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function FaskesEvidence() {
  const me = await getPrincipal("faskes");
  if (!can(me, "evidence.upload")) return <Forbidden need="evidence.upload" />;
  const db = getDb();
  const docs = facilityDocuments(db, me);
  const clar = facilityClarifications(db, me).filter((c) => c.status === "sent" || c.status === "lapsed");
  return (
    <>
      <PageHeader title="Dokumen bukti" eyebrow="Portal faskes" purpose="Dokumen yang Anda unggah. PDF yang berisi teks dibaca otomatis; pindaian dan gambar tidak dibaca mesin (tanpa OCR) dan akan ditranskripsi manual oleh petugas." />
      {clar.length > 0 ? (
        <Card className="space-y-3 p-4">
          <SectionTitle title="Unggah untuk permintaan klarifikasi" hint="Pilih permintaan yang sedang menunggu, lalu lampirkan dokumennya di halaman permintaan tersebut agar tertaut dengan benar." />
          <ul className="space-y-1 text-sm">{clar.map((c) => <li key={c.id}><a className="font-semibold underline underline-offset-4" href={`/faskes/klarifikasi/${c.id}`}>{c.id}</a> · {c.finding_title}</li>)}</ul>
        </Card>
      ) : <Card className="p-4"><UploadBox endpoint="/api/faskes/upload" label="Unggah dokumen tanpa permintaan tertentu" /></Card>}
      <section className="mt-6 space-y-3">
        <SectionTitle title="Dokumen yang sudah diunggah" />
        <Card className="divide-y divide-line">
          {docs.length === 0 && <EmptyState title="Belum ada dokumen" />}
          {docs.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="min-w-0"><a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">{d.name}</a><p className="text-xs text-muted"><span className="font-mono">{d.id}</span> · {(d.size / 1024).toFixed(1)} KB · {fmtDateTime(d.created_at)}{d.clarification_id ? ` · untuk ${d.clarification_id}` : ""}</p></div>
              <Tag t={d.processing_status === "needs_manual_transcription" ? "warn" : "ok"}>{d.processing_status === "needs_manual_transcription" ? "Menunggu transkripsi manual" : d.processing_status === "reviewed" ? "Sudah ditelaah" : "Teks terbaca"}</Tag>
            </div>
          ))}
        </Card>
      </section>
    </>
  );
}
