import { notFound } from "next/navigation";
import { ExtractionReview, ProcessButton, TranscribeEditor } from "@/components/pkbi/EvidenceForms";
import { Card, Forbidden, PageHeader, Pill, SectionTitle, SimNotice } from "@/components/ui";
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
      <PageHeader title={d.name} eyebrow="Dokumen bukti" crumbs={[{ label: "Dokumen bukti", href: "/console/documents" }, { label: d.id }]} purpose={`${d.episode_id ? `Episode ${d.episode_id} · ` : ""}${(d.size / 1024).toFixed(0)} KB · ${d.mime} · diunggah ${fmtDateTime(d.created_at)} oleh ${d.uploaded_role}`}>
        <div className="flex items-center gap-2"><Pill className={TONE_CLASS[s.tone]}>{s.label}</Pill><a className="text-sm font-semibold underline underline-offset-4" href={`/api/evidence/documents/${d.id}`} download>Unduh</a></div>
      </PageHeader>
      <SimNotice>{s.hint} SHA-256: <span className="font-mono">{d.sha256.slice(0, 16)}…</span></SimNotice>
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section className="space-y-3">
            <SectionTitle title="Teks dokumen" hint="Setiap usulan menyebut mesin yang menghasilkannya dan statusnya." />
            {extractions.length === 0 ? <Card className="p-4 text-sm text-ink-soft">Belum ada teks. {needsText && "Dokumen ini perlu transkripsi manual."}</Card> : extractions.map((e) => (
              <Card key={e.id} className="space-y-2 p-4">
                <p className="flex flex-wrap items-center gap-2 text-sm"><span className="font-mono text-xs">{e.id}</span><span className="text-muted">halaman {e.page ?? "-"}</span><Pill className={TONE_CLASS[e.simulated ? "warn" : "info"]}>{ENGINE_LABEL[e.engine]}</Pill><Pill className={TONE_CLASS[EX[e.status].tone]}>{EX[e.status].label}</Pill></p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-paper p-3 font-sans text-sm text-ink-soft">{e.corrected_text ?? e.text}</pre>
                {e.corrected_text && <details className="text-xs text-muted"><summary className="cursor-pointer">Teks usulan awal</summary><pre className="mt-1 whitespace-pre-wrap font-sans">{e.text}</pre></details>}
                {e.status === "proposed" && <ExtractionReview id={e.id} text={e.text} canReview={canReview} blockedReason={e.engine === "manual" && e.created_by === me.id ? "Transkripsi manual harus dikonfirmasi orang lain, bukan pengetiknya." : undefined} />}
                {e.reviewer && <p className="text-xs text-muted">Diputuskan oleh {e.reviewer} · {fmtDateTime(e.reviewed_at)}</p>}
              </Card>
            ))}
          </section>
        </div>
        <aside className="space-y-4 lg:col-span-2">
          {isImage && (
            <Card className="p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/evidence/documents/${d.id}?inline=1`} alt={`Pratinjau ${d.name}`} className="mx-auto max-h-96 w-auto rounded" />
            </Card>
          )}
          {needsText && can(me, "evidence.upload") && (
            <Card elevated className="p-4"><TranscribeEditor id={d.id} pageCount={d.page_count ?? 1} /></Card>
          )}
          {(d.processing_status === "uploaded" || d.processing_status === "ocr_unavailable" || d.processing_status === "failed") && can(me, "evidence.upload") && (
            <Card className="space-y-2 p-4 text-sm"><p className="text-ink-soft">Coba proses ulang bila mesin OCR sudah tersedia.</p><ProcessButton id={d.id} /></Card>
          )}
        </aside>
      </div>
    </>
  );
}
