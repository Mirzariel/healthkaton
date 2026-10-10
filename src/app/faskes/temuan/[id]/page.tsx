import Link from "next/link";
import { notFound } from "next/navigation";
import { CommandForm } from "@/components/casework/CommandForm";
import { Quote, Tag } from "@/components/casework/parts";
import { Card, Forbidden, PageHeader, ProofBadge, SectionTitle, SimNotice } from "@/components/ui";
import { AuthError, can } from "@/lib/auth/principal";
import { CAUSE_LABEL } from "@/lib/labels";
import { CLARIFICATION_LABEL, DISPUTE_LABEL } from "@/lib/casework/labels";
import { facilityFindingView } from "@/lib/casework/queries";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/idem";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function FaskesFinding({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getPrincipal("faskes");
  if (!can(me, "facility.respond")) return <Forbidden need="facility.respond" />;
  let v;
  try {
    v = facilityFindingView(getDb(), me, id);
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    if (e instanceof AuthError) return <Forbidden />;
    throw e;
  }
  const f = v.finding;
  return (
    <>
      <PageHeader title={f.title} eyebrow="Portal faskes" crumbs={[{ label: "Ringkasan", href: "/faskes" }, { label: f.id }]} purpose="Ini yang diketahui petugas tentang temuan ini. Anda berhak menjelaskan dan membantah." />
      <Card className="p-4" elevated>
        <div className="flex flex-wrap items-center gap-2"><ProofBadge status={f.proof_status} /><span className="text-xs text-muted">{f.type_label}{f.claim_no ? ` · klaim ${f.claim_no}` : ""} · perawatan {fmtDate(f.admit_date)}</span></div>
        {f.proof_status === "verified" && f.causes.length > 0 && (
          <div className="mt-3 text-sm"><p className="text-xs font-medium text-ink-soft">Penyebab yang ditetapkan petugas</p><div className="mt-1 flex flex-wrap gap-2">{f.causes.map((c) => <Tag key={c} t="info">{CAUSE_LABEL[c as keyof typeof CAUSE_LABEL]?.label ?? c}</Tag>)}</div>{f.causes_note && <p className="mt-1 text-ink-soft">{f.causes_note}</p>}</div>
        )}
        {f.proof_status === "inconclusive" && <p className="mt-3 text-sm text-ink-soft">Bukti belum cukup untuk menyimpulkan. Ini tidak berarti layanan tidak dilakukan.</p>}
      </Card>

      <section className="mt-6 space-y-3">
        <SectionTitle title="Permintaan klarifikasi" />
        {v.clarifications.length === 0 ? <p className="text-sm text-ink-soft">Tidak ada.</p> : (
          <Card className="divide-y divide-line">{v.clarifications.map((c) => <Link key={c.id} href={`/faskes/klarifikasi/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-brand-soft/40"><span><span className="font-semibold">{c.id}</span> · tenggat {fmtDateTime(c.due_at)}</span><Tag t={CLARIFICATION_LABEL[c.status as keyof typeof CLARIFICATION_LABEL].tone}>{CLARIFICATION_LABEL[c.status as keyof typeof CLARIFICATION_LABEL].label}</Tag></Link>)}</Card>
        )}
      </section>

      <section className="mt-6 space-y-3">
        <SectionTitle title="Bantahan" hint="Ajukan bila Anda tidak sependapat dengan temuan atau statusnya. Reviewer menanggapi dengan alasan; bantahan yang diterima atas temuan final membuka ulang peninjauan." />
        {v.disputes.map((d) => (
          <Card key={d.id} className="p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{d.id}</span><Tag t={DISPUTE_LABEL[d.status].tone}>{DISPUTE_LABEL[d.status].label}</Tag><span className="text-xs text-muted">{fmtDateTime(d.created_at)}</span></div>
            <Quote by="Bantahan Anda">{d.text}</Quote>
            {d.response && <p className="mt-2 text-ink-soft">Tanggapan: {d.response}</p>}
          </Card>
        ))}
        {v.canDispute ? (
          <Card className="p-4"><CommandForm command="create_dispute" endpoint="/api/faskes/commands" hidden={{ findingId: f.id }} submit="Kirim bantahan" doneMessage="Bantahan terkirim." fields={[{ kind: "textarea", name: "text", label: "Uraian bantahan (minimal 20 karakter)", rows: 4, required: true, hint: "Sebutkan dasarnya: dokumen, kejadian, atau ketentuan yang relevan." }]} /></Card>
        ) : <p className="text-sm text-ink-soft">Bantahan Anda sedang menunggu tanggapan.</p>}
      </section>

      <section className="mt-6 space-y-3">
        <SectionTitle title="Tindakan perbaikan" />
        {v.actions.length === 0 && <p className="text-sm text-ink-soft">Belum ada tindakan perbaikan untuk temuan ini.</p>}
        {v.actions.map((a) => <Card key={a.id} className="p-4 text-sm"><p className="font-semibold">{a.id}</p><p>{a.description}</p><p className="text-xs text-muted">pemilik {a.owner} · target {fmtDate(a.target_date)} · {a.status}</p></Card>)}
        {f.proof_status === "verified" && (
          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">Susun rencana tindakan perbaikan</p>
            <CommandForm command="create_action" endpoint="/api/faskes/commands" hidden={{ findingId: f.id }} submit="Simpan rencana tindakan" doneMessage="Rencana tindakan tersimpan." fields={[
              { kind: "textarea", name: "description", label: "Tindakan perbaikan", rows: 3, required: true },
              { kind: "text", name: "owner", label: "Penanggung jawab di faskes", required: true },
              { kind: "date", name: "targetDate", label: "Target selesai", required: true },
              { kind: "textarea", name: "remeasurePlan", label: "Bagaimana hasilnya akan diukur ulang", rows: 2 },
            ]} />
          </Card>
        )}
      </section>
      <div className="mt-6"><SimNotice>Skor sinyal, jawaban peserta, dan catatan internal petugas tidak ditampilkan kepada faskes.</SimNotice></div>
    </>
  );
}
