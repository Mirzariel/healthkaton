import { notFound } from "next/navigation";
import { ActionsBlock, CausesBlock, ClaimEvidenceBlock, ClaimReviewBlock, ClarificationsBlock, DisputesBlock, DocumentsBlock, LinksBlock, NotesBlock, ParticipantBlock, ProofBlock, SearchBlock, Section, StandardBlock, SuggestionsBlock, SummaryBlock, TimelineBlock, Disclose } from "@/components/casework/CaseRoomParts";
import { CommandForm } from "@/components/casework/CommandForm";
import { KV, Tag, userName } from "@/components/casework/parts";
import { Card, Forbidden, PageHeader, ProofBadge, SimNotice } from "@/components/ui";
import { AuthError, can } from "@/lib/auth/principal";
import { FINDING_LABEL, LIFECYCLE_LABEL } from "@/lib/labels";
import { PRIORITY_LABEL, SOURCE_LABEL } from "@/lib/casework/labels";
import { getCaseRoom, queueFacets } from "@/lib/casework/queries";
import { lapseIfDue } from "@/lib/casework/workflow";
import { PROOF_FINAL } from "@/lib/domain/transitions";
import { DomainError } from "@/lib/idem";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { nowIso } from "@/lib/clock";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function CaseRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getPrincipal("konsol");
  if (!can(me, "case.view")) return <Forbidden need="case.view" />;
  const db = getDb();
  lapseIfDue(db);
  let room;
  try {
    room = getCaseRoom(db, me, decodeURIComponent(id));
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    if (e instanceof AuthError) return <Forbidden />;
    throw e;
  }
  const names = new Map(queueFacets(db).assignees.map((a) => [a.id, a.name]));
  const today = nowIso().slice(0, 10);
  const c = room.case;
  const open = room.findings.filter((f) => !PROOF_FINAL.includes(f.finding.proof_status)).length;
  const canClose = can(me, "case.review") && c.lifecycle !== "closed" && open === 0 && room.actions.every((a) => a.status === "closed");

  return (
    <>
      <PageHeader title={`Kasus ${c.id}`} crumbs={[{ label: "Antrean kasus", href: "/console/cases" }, { label: c.id }]} eyebrow="Ruang kasus"
        purpose="Semua yang diketahui tentang perawatan ini ada di sini: standar, pernyataan peserta, dokumen faskes, bukti, ringkasan asisten, dan jejak keputusan. Asisten hanya menyusun draf; petugas yang memutuskan." />
      <Card className="p-4" elevated>
        <dl className="grid gap-x-8 sm:grid-cols-2">
          <KV k="Faskes">{room.facility.name}</KV>
          <KV k="Episode"><span className="font-mono">{c.episode_id}</span></KV>
          <KV k="Status kasus"><Tag t={c.lifecycle === "closed" ? "ok" : "info"}>{LIFECYCLE_LABEL[c.lifecycle]}</Tag></KV>
          <KV k="Prioritas"><Tag t={PRIORITY_LABEL[c.priority]?.tone ?? "muted"}>{PRIORITY_LABEL[c.priority]?.label ?? c.priority}</Tag></KV>
          <KV k="Penanggung jawab">{userName(c.assignee_id, names)}</KV>
          <KV k="Dibuka · target">{fmtDate(c.opened_at)} · {fmtDate(c.due_at)}</KV>
        </dl>
        {room.assignments.length > 0 && <p className="mt-1 text-xs text-muted">Alasan penugasan terakhir: {room.assignments[room.assignments.length - 1].reason}</p>}
        {can(me, "case.assign") && c.lifecycle !== "closed" && (
          <div className="mt-3"><Disclose label="Tugaskan ulang">
            <CommandForm command="assign_case" hidden={{ caseId: c.id }} submit="Tugaskan" tone="secondary" fields={[
              { kind: "select", name: "assignee", label: "Penerima tugas", options: room.assignees.map((a) => ({ value: a.id, label: `${a.name} (${a.role})` })) },
              { kind: "text", name: "reason", label: "Alasan penugasan", required: true },
            ]} />
          </Disclose></div>
        )}
      </Card>

      <div className="mt-6 space-y-8">
        {room.findings.map((r) => {
          const f = r.finding;
          return (
            <article key={f.id} id={f.id} className="space-y-3 scroll-mt-20" aria-labelledby={`h-${f.id}`}>
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted"><span className="font-mono">{f.id}</span> · {FINDING_LABEL[f.type].label} · sumber {SOURCE_LABEL[f.source]?.label ?? f.source}</p>
                  <h2 id={`h-${f.id}`} className="text-lg font-semibold tracking-tight">{f.title}</h2>
                  <p className="mt-0.5 max-w-3xl text-sm text-ink-soft">{f.summary}</p>
                </div>
                <ProofBadge status={f.proof_status} />
              </header>
              <Section id={`${f.id}-std`} title="Standar yang dipakai"><StandardBlock r={r} /></Section>
              <Section id={`${f.id}-klaim`} title="Klaim dan bukti pelaksanaan"><ClaimEvidenceBlock r={r} /></Section>
              <Section id={`${f.id}-peserta`} title="Pernyataan peserta" badge={<Tag t="muted">{r.pack.facts.length + r.pack.requests.length}</Tag>}><ParticipantBlock r={r} /></Section>
              <Section id={`${f.id}-dokumen`} title="Dokumen dan catatan dari faskes" badge={<Tag t="muted">{r.pack.documents.length}</Tag>}><DocumentsBlock r={r} me={me} /></Section>
              <Section id={`${f.id}-bukti`} title="Bukti tertaut" badge={<Tag t={r.pack.readiness.supports ? "ok" : "warn"}>{r.pack.links.length}</Tag>}><LinksBlock r={r} /></Section>
              <Section id={`${f.id}-cari`} title="Pencarian bukti" open={r.pack.searches.length > 0 || f.proof_status === "under_review"} badge={<Tag t="muted">{r.pack.searches.length}</Tag>}><SearchBlock r={r} me={me} /></Section>
              <Section id={`${f.id}-asisten`} title="Ringkasan asisten (draf)" hint="Draf yang dapat dikoreksi. Setiap pernyataan menyebut sumbernya." badge={r.summary ? <Tag t={r.summaryStale ? "warn" : "ok"}>{r.summaryStale ? "Perlu diperbarui" : `Versi ${r.summary.version}`}</Tag> : <Tag t="muted">Belum ada</Tag>}>
                <SummaryBlock r={r} me={me} />
                <SuggestionsBlock r={r} me={me} />
              </Section>
              <Section id={`${f.id}-klarifikasi`} title="Klarifikasi ke faskes" badge={<Tag t="muted">{r.pack.clarifications.length}</Tag>}><ClarificationsBlock r={r} me={me} /></Section>
              <Section id={`${f.id}-bukti-status`} title="Pembuktian"><ProofBlock r={r} me={me} /></Section>
              <Section id={`${f.id}-penyebab`} title="Penyebab dan eskalasi" open={f.proof_status === "verified"}><CausesBlock r={r} me={me} /></Section>
              {f.claim_id && <Section id={`${f.id}-klaim-review`} title="Keputusan klaim (simulasi, terpisah dari temuan)" open={r.canClaimReview}><ClaimReviewBlock r={r} me={me} /></Section>}
              <Section id={`${f.id}-bantahan`} title="Bantahan faskes" open={r.disputes.length > 0} badge={r.disputes.some((d) => d.status === "open") ? <Tag t="danger">Menunggu tanggapan</Tag> : <Tag t="muted">{r.disputes.length}</Tag>}><DisputesBlock r={r} me={me} /></Section>
            </article>
          );
        })}
        <section id="tindakan" className="space-y-3 scroll-mt-20">
          <h2 className="text-lg font-semibold tracking-tight">Tindakan perbaikan dan tindak lanjut</h2>
          <Section title="Tindakan" badge={<Tag t="muted">{room.actions.length}</Tag>}><ActionsBlock actions={room.actions} findings={room.findings} me={me} today={today} /></Section>
        </section>
        <section id="linimasa" className="space-y-3 scroll-mt-20">
          <h2 className="text-lg font-semibold tracking-tight">Linimasa dan catatan</h2>
          <Section title="Linimasa kasus" hint="Perawatan, layanan, catatan, jawaban peserta, klarifikasi, keputusan, dan tindakan, urut waktu." open={false} badge={<Tag t="muted">{room.timeline.length}</Tag>}><TimelineBlock items={room.timeline} /></Section>
          <Section title="Catatan internal" open={room.notes.length > 0} badge={<Tag t="muted">{room.notes.length}</Tag>}><NotesBlock caseId={c.id} notes={room.notes} findings={room.findings} me={me} /></Section>
        </section>
        {c.lifecycle !== "closed" ? (
          <section aria-label="Penutupan kasus">
            {can(me, "case.review") ? (
              <Section title="Tutup kasus" open={canClose} hint="Kasus dapat ditutup bila semua temuan berstatus final dan semua tindakan perbaikan sudah ditutup.">
                {canClose ? <CommandForm command="close_case" hidden={{ caseId: c.id }} submit="Tutup kasus" tone="secondary" confirm="Tutup kasus ini?" fields={[{ kind: "textarea", name: "reason", label: "Alasan penutupan (minimal 10 karakter)", rows: 2, required: true }]} /> : <p className="text-sm text-ink-soft">Belum dapat ditutup: {open} temuan belum final, {room.actions.filter((a) => a.status !== "closed").length} tindakan belum ditutup.</p>}
              </Section>
            ) : null}
          </section>
        ) : <SimNotice>Kasus ditutup {fmtDateTime(c.closed_at)}. Alasan: {c.close_reason}</SimNotice>}
      </div>
    </>
  );
}
