import { notFound } from "next/navigation";
import { ExtractionReview, ProcessButton, TranscribeEditor } from "@/components/pkbi/EvidenceForms";
import { Inset, RecordId, SideFacts } from "@/components/console/Parts";
import { IconDownload } from "@/components/icons";
import { Card, CardHeader, EmptyState, Forbidden, PageHeader, Pill, SimNotice } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { fmtDateTime } from "@/lib/dates";
import { ENGINE_LABEL, STATUS_LABEL, getDocument } from "@/lib/evidence/service";
import { DomainError } from "@/lib/idem";
import { TONE_CLASS } from "@/lib/labels";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";
const EX: Record<string, { label: string; tone: keyof typeof TONE_CLASS }> = { proposed: { label: "Usulan, belum dikonfirmasi", tone: "warn" }, confirmed: { label: "Dikonfirmasi", tone: "ok" }, corrected: { label: "Dikoreksi peninjau", tone: "ok" }, rejected: { label: "Ditolak", tone: "muted" } };

export default async function DocumentDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await getPrincipal("konsol");
  if (!can(me, "evidence.upload") && !can(me, "evidence.review")) return <Forbidden need="evidence.upload" />;
  const { id } = await params;
  let data;
  try { data = getDocument(getDb(), me, decodeURIComponent(id)); } catch (e) { if (e instanceof DomainError && e.status === 404) notFound(); throw e; }
  const { document: d, extractions } = data;
  const s = STATUS_LABEL[d.processing_status];
  const active = extractions.some((e) => e.status !== "rejected");
  const needsText = !active && d.processing_status !== "failed";
  const canReview = can(me, "evidence.review");
  const isImage = d.mime.startsWith("image/");
  return (
    <>
      <PageHeader title={d.name} eyebrow="Dokumen bukti" crumbs={[{ label: "Dokumen bukti", href: "/console/documents" }, { label: d.id }]} purpose="Telaah teks dokumen. Setiap teks berstatus usulan sampai dikonfirmasi.">
        <Pill className={TONE_CLASS[s.tone]}>{s.label}</Pill>
        <a className="btn btn-secondary btn-sm" href={`/api/evidence/documents/${d.id}`} download><IconDownload size={15} />Unduh</a>
      </PageHeader>
      <SimNotice>{s.hint} SHA-256: <span className="font-mono">{d.sha256.slice(0, 16)}…</span></SimNotice>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="min-w-0 space-y-3" aria-labelledby="teks">
          <div>
            <h2 id="teks" className="text-[15px] font-semibold tracking-tight">Teks dokumen</h2>
          </div>
          {extractions.length === 0 ? <Card><EmptyState title="Belum ada teks">{needsText ? "Dokumen ini perlu transkripsi manual. Ketik isinya pada panel di samping." : "Belum ada teks yang diekstraksi dari dokumen ini."}</EmptyState></Card> : extractions.map((e) => (
            <Card key={e.id} elevated>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-line px-5 py-3 text-[13px]">
                <RecordId className="text-ink">{e.id}</RecordId><span className="text-muted">halaman {e.page ?? "-"}</span>
                <Pill className={TONE_CLASS[e.simulated ? "warn" : "info"]}>{ENGINE_LABEL[e.engine]}</Pill>
                <Pill className={TONE_CLASS[EX[e.status].tone]}>{EX[e.status].label}</Pill>
              </div>
              <div className="space-y-3 px-5 py-4">
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-subtle p-3.5 font-sans text-[14px] leading-relaxed text-ink-soft">{e.corrected_text ?? e.text}</pre>
                {e.corrected_text && <details className="text-[13px] text-muted"><summary className="cursor-pointer font-medium">Teks usulan awal</summary><pre className="mt-2 whitespace-pre-wrap font-sans">{e.text}</pre></details>}
                {e.status === "proposed" && <ExtractionReview id={e.id} text={e.text} canReview={canReview} blockedReason={e.engine === "manual" && e.created_by === me.id ? "Transkripsi manual harus dikonfirmasi orang lain, bukan pengetiknya." : undefined} />}
                {e.reviewer && <p className="text-[12.5px] text-muted">Diputuskan oleh {e.reviewer} · {fmtDateTime(e.reviewed_at)}</p>}
              </div>
            </Card>
          ))}
        </section>
        <aside className="space-y-4" aria-label="Berkas dan tindakan">
          <Inset title="Berkas">
            <div><SideFacts items={[
              ...(d.episode_id ? [{ k: "Episode", v: <RecordId className="text-ink">{d.episode_id}</RecordId> }] : []),
              { k: "Ukuran", v: <span className="tabular-nums">{(d.size / 1024).toFixed(0)} KB</span> },
              { k: "Jenis", v: <span className="font-mono text-[12px]">{d.mime}</span> },
              { k: "Diunggah", v: <>{fmtDateTime(d.created_at)} oleh {d.uploaded_role}</> },
            ]} /></div>
          </Inset>
          {isImage && (
            <Card className="p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/evidence/documents/${d.id}?inline=1`} alt={`Pratinjau ${d.name}`} className="mx-auto max-h-96 w-auto rounded" />
            </Card>
          )}
          {needsText && can(me, "evidence.upload") && (
            <Card><CardHeader title="Transkripsi manual" /><div className="p-5"><TranscribeEditor id={d.id} pageCount={d.page_count ?? 1} /></div></Card>
          )}
          {(d.processing_status === "uploaded" || d.processing_status === "ocr_unavailable" || d.processing_status === "failed") && can(me, "evidence.upload") && (
            <Card className="space-y-3 p-5 text-[14px]"><p className="text-ink-soft">Coba proses ulang bila mesin OCR sudah tersedia.</p><ProcessButton id={d.id} /></Card>
          )}
        </aside>
      </div>
    </>
  );
}
