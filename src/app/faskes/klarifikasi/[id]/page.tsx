import Link from "next/link";
import { notFound } from "next/navigation";
import { CommandForm } from "@/components/casework/CommandForm";
import { Quote, Tag } from "@/components/casework/parts";
import { UploadBox } from "@/components/casework/UploadBox";
import { Card, Forbidden, PageHeader, ProofBadge, SectionTitle } from "@/components/ui";
import { AuthError, can } from "@/lib/auth/principal";
import { CLARIFICATION_LABEL } from "@/lib/casework/labels";
import { facilityClarificationDetail } from "@/lib/casework/queries";
import { fmtDateTime } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/idem";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function FaskesClarificationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getPrincipal("faskes");
  if (!can(me, "facility.respond")) return <Forbidden need="facility.respond" />;
  let d;
  try {
    d = facilityClarificationDetail(getDb(), me, id);
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    if (e instanceof AuthError) return <Forbidden />;
    throw e;
  }
  const c = d.clarification as unknown as { id: string; status: keyof typeof CLARIFICATION_LABEL; issue: string; requested_docs: string[]; minimal_ref: string | null; due_at: string; sent_at: string; response_text: string | null; answered_at: string | null };
  const l = CLARIFICATION_LABEL[c.status];
  return (
    <>
      <PageHeader title={`Klarifikasi ${c.id}`} eyebrow="Portal faskes" crumbs={[{ label: "Permintaan klarifikasi", href: "/faskes/klarifikasi" }, { label: c.id }]} purpose="Jelaskan kondisi yang terjadi dan lampirkan dokumen yang relevan. Permintaan ini belum menyimpulkan apa pun." />
      <Card className="p-4" elevated>
        <div className="flex flex-wrap items-center gap-2"><Tag t={l.tone} title={l.hint}>{l.label}</Tag><span className="text-xs text-muted">Dikirim {fmtDateTime(c.sent_at)} · tenggat {fmtDateTime(c.due_at)}</span>{d.finding && <ProofBadge status={d.finding.proof_status} />}</div>
        <p className="mt-3 text-sm">{c.issue}</p>
        {c.requested_docs.length > 0 && <div className="mt-3"><p className="text-xs font-medium text-ink-soft">Dokumen yang diminta</p><ul className="list-disc pl-5 text-sm">{c.requested_docs.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        {c.minimal_ref && <p className="mt-3 text-xs text-muted">Rujukan perawatan: {c.minimal_ref}</p>}
        {c.status === "lapsed" && <p className="mt-3 rounded-lg bg-paper/70 px-3 py-2 text-sm text-ink-soft">{l.hint}</p>}
        {d.finding && <p className="mt-3 text-sm"><Link className="font-semibold underline underline-offset-4" href={`/faskes/temuan/${d.finding.id}`}>Lihat temuan terkait dan ajukan bantahan</Link></p>}
      </Card>

      <section className="mt-6 space-y-3">
        <SectionTitle title="Jawaban dan lampiran" />
        {d.messages.length === 0 && <p className="text-sm text-ink-soft">Belum ada jawaban.</p>}
        {d.messages.map((m, i) => <Quote key={i} by={`${m.author_role === "faskes" ? "Faskes" : "Petugas"} · ${fmtDateTime(m.at)}${m.document_id ? ` · lampiran ${m.document_id}` : ""}`}>{m.text}</Quote>)}
        {d.docs.length > 0 && (
          <Card className="divide-y divide-line">
            {d.docs.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <a href={`/api/documents/${x.id}`} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">{x.name}</a>
                <span className="text-xs text-muted">{x.id} · {(x.size / 1024).toFixed(1)} KB · {x.processing_status === "needs_manual_transcription" ? "akan ditranskripsi manual oleh petugas" : "teks terbaca"} · {fmtDateTime(x.created_at)}</span>
              </div>
            ))}
          </Card>
        )}
      </section>

      {d.canAnswer && (
        <section className="mt-6 space-y-4">
          <SectionTitle title={c.status === "lapsed" ? "Jawab (terlambat tetap diterima)" : "Jawab permintaan ini"} />
          <Card className="space-y-4 p-4">
            <UploadBox endpoint="/api/faskes/upload" hidden={{ clarificationId: c.id }} label="1. Lampirkan dokumen (opsional, bisa lebih dari satu kali)" />
            <CommandForm command="respond_clarification" endpoint="/api/faskes/commands" hidden={{ clarificationId: c.id }} submit="Kirim jawaban" doneMessage="Jawaban terkirim." fields={[
              { kind: "textarea", name: "text", label: "2. Penjelasan faskes", rows: 5, required: true, hint: "Sebutkan juga lokasi pencatatan bila dokumen sudah ada tetapi belum tertaut. Unggah dulu dokumennya, lalu pilih sebagai dokumen utama." },
              { kind: "select", name: "documentId", label: "Dokumen utama yang dirujuk jawaban (opsional)", options: [{ value: "", label: "Tanpa dokumen utama" }, ...d.docs.map((x) => ({ value: x.id, label: `${x.name} (${x.id})` }))] },
            ]} />
          </Card>
        </section>
      )}
    </>
  );
}
