import Link from "next/link";
import { notFound } from "next/navigation";
import { CommandForm } from "@/components/casework/CommandForm";
import { Quote } from "@/components/casework/parts";
import { UploadBox } from "@/components/casework/UploadBox";
import { DocStatus, dueInfo, kb } from "@/components/faskes/parts";
import { IconFile } from "@/components/icons";
import { Card, CardHeader, Forbidden, Notice, PageHeader, ProofBadge, SectionTitle, StatusPill } from "@/components/ui";
import { AuthError, can } from "@/lib/auth/principal";
import { CLARIFICATION_LABEL } from "@/lib/casework/labels";
import { facilityClarificationDetail } from "@/lib/casework/queries";
import { nowIso } from "@/lib/clock";
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
  const now = nowIso();
  const due = dueInfo(c.status, c.due_at, now);

  return (
    <>
      <PageHeader
        title={`Klarifikasi ${c.id}`}
        crumbs={[{ label: "Permintaan klarifikasi", href: "/faskes/klarifikasi" }, { label: c.id }]}
        purpose="Jelaskan dan lampirkan dokumen. Permintaan ini belum menyimpulkan apa pun."
      >
        <StatusPill tone={l.tone} title={l.hint}>{l.label}</StatusPill>
      </PageHeader>

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {c.status === "lapsed" && <Notice tone="info" title="Lewat tenggat, jawaban tetap diterima" />}
          {c.status === "sent" && (
            <Notice tone={due.soon ? "warn" : "info"} title={`Jawab sebelum ${fmtDateTime(c.due_at)}`}>
              Terlambat pun tetap diterima dan tidak memengaruhi penilaian.
            </Notice>
          )}
          {c.status === "answered" && <Notice tone="ok" title={`Sudah dijawab ${fmtDateTime(c.answered_at)}`} />}

          <Card elevated={!d.canAnswer}>
            <CardHeader title="Yang diminta petugas" hint={`Dikirim ${fmtDateTime(c.sent_at)}`} />
            <div className="space-y-4 px-5 py-4">
              <p className="max-w-2xl text-[15px] leading-relaxed text-ink">{c.issue}</p>
              {c.requested_docs.length > 0 && (
                <div>
                  <p className="text-[13px] font-medium text-ink-soft">Dokumen yang diminta</p>
                  <ul className="mt-1.5 space-y-1.5">
                    {c.requested_docs.map((x) => (
                      <li key={x} className="flex items-start gap-2 text-[14px] text-ink">
                        <IconFile size={15} className="mt-[3px] shrink-0 text-muted" />
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {c.minimal_ref && <p className="text-[13px] text-muted">Rujukan: {c.minimal_ref}</p>}
            </div>
          </Card>

          {(d.messages.length > 0 || d.docs.length > 0) && (
            <section className="space-y-3" aria-labelledby="riwayat-jawaban">
              <SectionTitle id="riwayat-jawaban" title="Jawaban dan lampiran" />
              {d.messages.map((m, i) => (
                <Quote key={i} by={`${m.author_role === "faskes" ? "Faskes" : "Petugas"}, ${fmtDateTime(m.at)}${m.document_id ? `, lampiran ${m.document_id}` : ""}`}>{m.text}</Quote>
              ))}
              {d.docs.length > 0 && (
                <Card className="divide-y divide-line">
                  {d.docs.map((x) => (
                    <div key={x.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                      <div className="min-w-0">
                        <a href={`/api/documents/${x.id}`} target="_blank" rel="noreferrer" className="link break-all text-[14px] font-medium">{x.name}</a>
                        <p className="text-[12.5px] text-muted"><span className="font-mono text-[12px]">{x.id}</span> &nbsp;{kb(x.size)}, {fmtDateTime(x.created_at)}</p>
                      </div>
                      <DocStatus status={x.processing_status} />
                    </div>
                  ))}
                </Card>
              )}
            </section>
          )}

          {d.canAnswer && (
            <section aria-labelledby="form-jawab">
              <Card elevated className="border-brand/30">
                <CardHeader
                  title={<span id="form-jawab">Jawab permintaan ini</span>}
                />
                <div className="space-y-5 px-5 py-5">
                  <UploadBox endpoint="/api/faskes/upload" hidden={{ clarificationId: c.id }} label="1. Lampirkan dokumen (opsional)" />
                  <div className="border-t border-line pt-5">
                    <CommandForm command="respond_clarification" endpoint="/api/faskes/commands" hidden={{ clarificationId: c.id }} submit="Kirim jawaban" doneMessage="Jawaban terkirim." fields={[
                      { kind: "textarea", name: "text", label: "2. Penjelasan faskes", rows: 5, required: true, hint: "Bila dokumen sudah ada tetapi belum tertaut, sebutkan lokasinya." },
                      { kind: "select", name: "documentId", label: "Dokumen utama (opsional)", options: [{ value: "", label: "Tanpa dokumen utama" }, ...d.docs.map((x) => ({ value: x.id, label: `${x.name} (${x.id})` }))] },
                    ]} />
                  </div>
                </div>
              </Card>
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-36 lg:self-start" aria-label="Rincian permintaan">
          <div className="panel-inset">
            <CardHeader title="Rincian" />
            <div className="px-5 py-1">
              <dl className="divide-y divide-line text-[13.5px]">
                {[
                  { k: "Dikirim", v: fmtDateTime(c.sent_at) },
                  { k: "Tenggat", v: fmtDateTime(c.due_at) },
                  ...(c.status === "answered" ? [{ k: "Dijawab", v: fmtDateTime(c.answered_at) }] : [{ k: "Sisa waktu", v: due.text }]),
                  ...(d.finding ? [{ k: "Status temuan", v: <ProofBadge status={d.finding.proof_status} /> }] : []),
                ].map((r) => (
                  <div key={r.k} className="grid grid-cols-[6.5rem_1fr] items-center gap-3 py-2.5">
                    <dt className="text-[13px] text-muted">{r.k}</dt>
                    <dd className="min-w-0 text-ink">{r.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          {d.finding && (
            <div className="panel-inset px-5 py-4">
              <p className="text-[13px] font-medium text-ink-soft">Temuan terkait</p>
              <p className="mt-1 text-[14px] font-semibold leading-snug text-ink">{d.finding.title}</p>
              <p className="mt-1.5 text-[13px] text-muted">Dapat dibantah kapan saja.</p>
              <Link className="btn btn-secondary btn-sm mt-3" href={`/faskes/temuan/${d.finding.id}`}>Lihat temuan</Link>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
