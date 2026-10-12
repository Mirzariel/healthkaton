import Link from "next/link";
import { notFound } from "next/navigation";
import { CommandForm } from "@/components/casework/CommandForm";
import { Quote, Tag } from "@/components/casework/parts";
import { ActionProgress, DueLine, Timeline, type TimelineItem } from "@/components/faskes/parts";
import { Card, CardHeader, DescList, Forbidden, Notice, PageHeader, ProofBadge, Section, SectionTitle, StatusPill } from "@/components/ui";
import { AuthError, can } from "@/lib/auth/principal";
import { ACTION_LABEL, CAUSE_LABEL } from "@/lib/labels";
import { CLARIFICATION_LABEL, DISPUTE_LABEL } from "@/lib/casework/labels";
import { facilityFindingView } from "@/lib/casework/queries";
import { nowIso } from "@/lib/clock";
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
  const now = nowIso();
  const answerable = v.clarifications.find((c) => c.status === "sent" || c.status === "lapsed");

  // Riwayat dari data yang sudah ada: permintaan klarifikasi, jawaban, bantahan, tanggapan, dan pembaruan terakhir.
  const history: TimelineItem[] = [];
  for (const c of v.clarifications) {
    history.push({ at: c.sent_at, title: `Permintaan klarifikasi ${c.id} dikirim`, note: `Tenggat ${fmtDateTime(c.due_at)}`, tone: "warn" });
    if (c.answered_at) history.push({ at: c.answered_at, title: `Faskes menjawab ${c.id}`, tone: "ok" });
  }
  for (const d of v.disputes) {
    history.push({ at: d.created_at, title: `Bantahan ${d.id} diajukan`, tone: "info" });
    if (d.resolved_at) history.push({ at: d.resolved_at, title: `Bantahan ${d.id}: ${DISPUTE_LABEL[d.status].label}`, note: d.response ?? undefined, tone: DISPUTE_LABEL[d.status].tone });
  }
  history.push({ at: f.updated_at, title: "Temuan diperbarui", tone: "muted" });
  history.sort((a, b) => a.at.localeCompare(b.at));

  const facts = [
    { k: "Status pembuktian", v: <ProofBadge status={f.proof_status} /> },
    { k: "Jenis temuan", v: f.type_label },
    ...(f.claim_no ? [{ k: "Nomor klaim", v: <span className="font-mono text-[13px]">{f.claim_no}</span> }] : []),
    { k: "Tanggal perawatan", v: fmtDate(f.admit_date) },
    { k: "Terakhir diperbarui", v: fmtDate(f.updated_at) },
  ];

  return (
    <>
      <PageHeader title={f.title} crumbs={[{ label: "Ringkasan", href: "/faskes" }, { label: f.id }]} purpose="Yang diketahui petugas tentang temuan ini.">
        {answerable ? (
          <Link href={`/faskes/klarifikasi/${answerable.id}`} className="btn btn-primary">Jawab klarifikasi {answerable.id}</Link>
        ) : v.canDispute ? (
          <a href="#bantahan" className="btn btn-secondary">Ajukan bantahan</a>
        ) : null}
      </PageHeader>

      <div className="grid gap-x-8 gap-y-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-9">
          <Card elevated>
            <CardHeader title="Fakta temuan" />
            <div className="px-5 py-1.5">
              <DescList items={facts} />
            </div>
            {f.proof_status === "verified" && f.causes.length > 0 && (
              <div className="border-t border-line px-5 py-4">
                <p className="text-[13px] font-medium text-ink-soft">Penyebab yang ditetapkan petugas</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">{f.causes.map((c) => <Tag key={c} t="info">{CAUSE_LABEL[c as keyof typeof CAUSE_LABEL]?.label ?? c}</Tag>)}</div>
                {f.causes_note && <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-soft">{f.causes_note}</p>}
              </div>
            )}
            {f.proof_status === "inconclusive" && (
              <div className="border-t border-line px-5 py-4">
                <Notice tone="neutral">Bukti belum cukup untuk menyimpulkan. Ini tidak berarti layanan tidak dilakukan.</Notice>
              </div>
            )}
          </Card>

          <Section id="klarifikasi" className="mt-0">
            <SectionTitle title="Permintaan klarifikasi" />
            {v.clarifications.length === 0 ? (
              <p className="text-[14px] text-muted">Belum ada.</p>
            ) : (
              <Card className="divide-y divide-line overflow-hidden">
                {v.clarifications.map((c) => {
                  const l = CLARIFICATION_LABEL[c.status as keyof typeof CLARIFICATION_LABEL];
                  return (
                    <Link key={c.id} href={`/faskes/klarifikasi/${c.id}`} className="block px-4 py-3.5 transition-colors hover:bg-subtle/70">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="font-mono text-[12px] text-muted">{c.id}</span>
                        <StatusPill tone={l.tone} title={l.hint}>{l.label}</StatusPill>
                      </div>
                      <p className="mt-1 line-clamp-2 max-w-3xl text-[13.5px] leading-relaxed text-ink-soft">{c.issue}</p>
                      <p className="mt-1.5 text-[12.5px] text-muted"><DueLine status={c.status} dueAt={c.due_at} answeredAt={c.answered_at} now={now} /></p>
                    </Link>
                  );
                })}
              </Card>
            )}
          </Section>

          <Section id="bantahan" className="mt-0 scroll-mt-40">
            <SectionTitle title="Bantahan" hint="Ajukan bila Anda tidak sependapat dengan temuan atau statusnya." />
            <details className="group -mt-2 text-[13px] text-muted">
              <summary className="cursor-pointer select-none font-medium text-brand-ink hover:underline">Selengkapnya</summary>
              <p className="mt-1 max-w-2xl leading-relaxed">Reviewer menanggapi dengan alasan. Bantahan yang diterima atas temuan final membuka ulang peninjauan.</p>
            </details>
            {v.disputes.map((d) => (
              <Card key={d.id} className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="font-mono text-[12px] text-muted">{d.id}</span>
                  <StatusPill tone={DISPUTE_LABEL[d.status].tone}>{DISPUTE_LABEL[d.status].label}</StatusPill>
                  <span className="text-[12.5px] text-muted">{fmtDateTime(d.created_at)}</span>
                </div>
                <Quote by="Bantahan Anda">{d.text}</Quote>
                {d.response && (
                  <div className="rounded-lg border border-line bg-subtle/60 px-3.5 py-2.5 text-[14px] leading-relaxed text-ink-soft">
                    <p className="text-[12.5px] font-medium text-ink">Tanggapan reviewer</p>
                    {d.response}
                  </div>
                )}
              </Card>
            ))}
            {v.canDispute ? (
              <Card className="px-5 py-4">
                <CommandForm command="create_dispute" endpoint="/api/faskes/commands" hidden={{ findingId: f.id }} submit="Kirim bantahan" tone="secondary" doneMessage="Bantahan terkirim." fields={[{ kind: "textarea", name: "text", label: "Uraian bantahan (minimal 20 karakter)", rows: 4, required: true, hint: "Sebutkan dasarnya: dokumen, kejadian, atau ketentuan." }]} />
              </Card>
            ) : (
              <Notice tone="info">Bantahan Anda sedang menunggu tanggapan.</Notice>
            )}
          </Section>

          <Section id="tindakan" className="mt-0">
            <SectionTitle title="Tindakan perbaikan" />
            {v.actions.length === 0 && <p className="text-[14px] text-muted">Belum ada.</p>}
            {v.actions.map((a) => (
              <Card key={a.id} className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="font-mono text-[12px] text-muted">{a.id}</span>
                  <StatusPill tone={a.status === "closed" ? "ok" : a.status === "follow_up_pending" ? "info" : "warn"}>{ACTION_LABEL[a.status as keyof typeof ACTION_LABEL] ?? a.status}</StatusPill>
                </div>
                <p className="text-[14.5px] leading-relaxed text-ink">{a.description}</p>
                <p className="text-[13px] text-muted">Pemilik {a.owner}, target {fmtDate(a.target_date)}</p>
                <ActionProgress status={a.status} />
              </Card>
            ))}
            {f.proof_status === "verified" && (
              <Card>
                <CardHeader title="Susun rencana perbaikan" />
                <div className="px-5 py-4">
                  <CommandForm command="create_action" endpoint="/api/faskes/commands" hidden={{ findingId: f.id }} submit="Simpan rencana tindakan" doneMessage="Rencana tindakan tersimpan." fields={[
                    { kind: "textarea", name: "description", label: "Tindakan perbaikan", rows: 3, required: true },
                    { kind: "text", name: "owner", label: "Penanggung jawab di faskes", required: true },
                    { kind: "date", name: "targetDate", label: "Target selesai", required: true },
                    { kind: "textarea", name: "remeasurePlan", label: "Cara mengukur ulang hasil", rows: 2 },
                  ]} />
                </div>
              </Card>
            )}
          </Section>
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-36 lg:self-start" aria-label="Riwayat dan hak faskes">
          <div className="panel-inset">
            <CardHeader title="Riwayat" />
            <div className="px-5 py-4"><Timeline items={history} /></div>
          </div>
          <p className="px-1 text-[12.5px] leading-relaxed text-muted">Anda berhak menjelaskan dan membantah kapan saja; jawaban terlambat tetap diterima. Skor sinyal, jawaban peserta, dan catatan internal tidak ditampilkan.</p>
        </aside>
      </div>
    </>
  );
}
