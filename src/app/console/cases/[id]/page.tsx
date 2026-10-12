import { notFound } from "next/navigation";
import { ActionsBlock, CausesBlock, ClaimEvidenceBlock, ClaimReviewBlock, ClarificationsBlock, DisputesBlock, DocumentsBlock, LinksBlock, NotesBlock, ParticipantBlock, ProofBlock, SearchBlock, Section, StandardBlock, SuggestionsBlock, SummaryBlock, TimelineBlock, Disclose } from "@/components/casework/CaseRoomParts";
import { CommandForm } from "@/components/casework/CommandForm";
import { Tag, userName } from "@/components/casework/parts";
import { Inset, JumpLink, RecordId, SideFacts } from "@/components/console/Parts";
import { OpenOnHash } from "@/components/console/OpenOnHash";
import { Card, Forbidden, PageHeader, ProofBadge, SectionTitle, SimNotice } from "@/components/ui";
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
  const actionsOpen = room.actions.filter((a) => a.status !== "closed").length;
  const canClose = can(me, "case.review") && c.lifecycle !== "closed" && open === 0 && room.actions.every((a) => a.status === "closed");

  /* Daftar "perlu tindakan": hanya menurunkan dari data yang sudah dimuat di ruang kasus. */
  const todo: { href: string; text: string; fid?: string }[] = [];
  for (const r of room.findings) {
    const f = r.finding;
    if (r.pendingProposal) todo.push({ href: `#${f.id}-bukti-status`, fid: f.id, text: can(me, "case.review") && r.pendingProposal.actor_id !== me.id ? "Usulan pembuktian menunggu keputusan Anda" : "Usulan pembuktian menunggu reviewer" });
    if (r.disputes.some((d) => d.status === "open")) todo.push({ href: `#${f.id}-bantahan`, fid: f.id, text: "Bantahan faskes menunggu tanggapan" });
    if (r.pack.clarifications.some((q) => q.status === "sent")) todo.push({ href: `#${f.id}-klarifikasi`, fid: f.id, text: "Menunggu jawaban klarifikasi faskes" });
    const sug = r.suggestions.filter((s) => s.state === "proposed").length;
    if (sug > 0) todo.push({ href: `#${f.id}-asisten`, fid: f.id, text: `${sug} saran asisten menunggu keputusan` });
    if (f.proof_status === "signal" && can(me, "case.work")) todo.push({ href: `#${f.id}-bukti-status`, fid: f.id, text: "Sinyal belum ditinjau" });
  }
  if (actionsOpen > 0) todo.push({ href: "#tindakan", text: `${actionsOpen} tindakan perbaikan belum ditutup` });

  const chips = (fid: string, hasClaim: boolean) => [
    ["Standar", `${fid}-std`], ["Klaim dan bukti", `${fid}-klaim`], ["Peserta", `${fid}-peserta`], ["Dokumen", `${fid}-dokumen`], ["Bukti tertaut", `${fid}-bukti`], ["Pencarian", `${fid}-cari`],
    ["Asisten", `${fid}-asisten`], ["Klarifikasi", `${fid}-klarifikasi`], ["Pembuktian", `${fid}-bukti-status`], ["Penyebab", `${fid}-penyebab`], ...(hasClaim ? [["Keputusan klaim", `${fid}-klaim-review`]] : []), ["Bantahan", `${fid}-bantahan`],
  ];

  return (
    <>
      <OpenOnHash />
      <PageHeader title={`Kasus ${c.id}`} crumbs={[{ label: "Antrean kasus", href: "/console/cases" }, { label: c.id }]} eyebrow="Ruang kasus"
        purpose="Bukti, ringkasan, dan keputusan untuk satu perawatan. Asisten hanya menyusun draf.">
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Kolom samping: status, yang perlu dikerjakan, daftar temuan, navigasi. Di ponsel tampil lebih dulu sebagai ringkasan. */}
        <aside className="space-y-4 lg:order-2" aria-label="Ringkasan kasus">
          <Inset title="Status kasus">
            <div>
              <SideFacts items={[
                { k: "Faskes", v: room.facility.name },
                { k: "Episode", v: <RecordId className="text-ink">{c.episode_id}</RecordId> },
                { k: "Status kasus", v: <Tag t={c.lifecycle === "closed" ? "ok" : "info"}>{LIFECYCLE_LABEL[c.lifecycle]}</Tag> },
                { k: "Prioritas", v: <Tag t={PRIORITY_LABEL[c.priority]?.tone ?? "muted"}>{PRIORITY_LABEL[c.priority]?.label ?? c.priority}</Tag> },
                { k: "Penanggung jawab", v: userName(c.assignee_id, names) },
                { k: "Dibuka", v: <span className="tabular-nums">{fmtDate(c.opened_at)}</span> },
                { k: "Target", v: <span className="tabular-nums">{fmtDate(c.due_at)}</span> },
              ]} />
              {room.assignments.length > 0 && <p className="mt-3 text-[12.5px] leading-snug text-muted">Alasan penugasan terakhir: {room.assignments[room.assignments.length - 1].reason}</p>}
              {can(me, "case.assign") && c.lifecycle !== "closed" && (
                <div className="mt-4"><Disclose label="Tugaskan ulang">
                  <CommandForm command="assign_case" hidden={{ caseId: c.id }} submit="Tugaskan" tone="secondary" fields={[
                    { kind: "select", name: "assignee", label: "Penerima tugas", options: room.assignees.map((a) => ({ value: a.id, label: `${a.name} (${a.role})` })) },
                    { kind: "text", name: "reason", label: "Alasan penugasan", required: true },
                  ]} />
                </Disclose></div>
              )}
            </div>
          </Inset>

          <Inset title="Perlu tindakan" flush>
            {todo.length === 0 ? <p className="px-5 pb-4 text-[13.5px] text-ink-soft">Tidak ada yang menunggu pada kasus ini.</p> : (
              <ul className="divide-y divide-line/70 pb-1">
                {todo.map((t, i) => (
                  <li key={i}>
                    <a href={t.href} className="block px-5 py-2.5 transition-colors hover:bg-card/70">
                      <span className="block text-[13.5px] font-medium text-ink">{t.text}</span>
                      {t.fid && <RecordId>{t.fid}</RecordId>}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Inset>

          <Inset title={`Temuan (${room.findings.length})`} flush className="hidden lg:block">
            <ul className="divide-y divide-line/70 pb-1">
              {room.findings.map((r) => (
                <li key={r.finding.id}>
                  <a href={`#${r.finding.id}`} className="block px-5 py-2.5 transition-colors hover:bg-card/70">
                    <span className="flex items-center justify-between gap-2"><RecordId>{r.finding.id}</RecordId><ProofBadge status={r.finding.proof_status} /></span>
                    <span className="mt-1 line-clamp-2 block text-[13.5px] text-ink">{r.finding.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Inset>

          <Inset title="Di halaman ini" flush className="hidden lg:sticky lg:top-20 lg:block">
            <nav aria-label="Bagian kasus" className="px-2 pb-2">
              <JumpLink href="#tindakan" count={room.actions.length}>Tindakan perbaikan</JumpLink>
              <JumpLink href="#linimasa" count={room.timeline.length}>Linimasa</JumpLink>
              <JumpLink href="#catatan" count={room.notes.length}>Catatan internal</JumpLink>
              {c.lifecycle !== "closed" && can(me, "case.review") && <JumpLink href="#penutupan">Tutup kasus</JumpLink>}
            </nav>
          </Inset>
        </aside>

        <div className="min-w-0 space-y-12 lg:order-1">
          {room.findings.map((r) => {
            const f = r.finding;
            return (
              <article key={f.id} id={f.id} className="scroll-mt-20 space-y-2.5" aria-labelledby={`h-${f.id}`}>
                <Card elevated>
                  <header className="grid grid-cols-1 items-start gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted"><RecordId>{f.id}</RecordId><span>{FINDING_LABEL[f.type].label}</span><span>sumber {SOURCE_LABEL[f.source]?.label ?? f.source}</span></p>
                      <h2 id={`h-${f.id}`} className="mt-1 text-[1.125rem] font-semibold leading-snug tracking-tight">{f.title}</h2>
                      <p className="mt-1 max-w-3xl text-[14px] leading-relaxed text-ink-soft">{f.summary}</p>
                    </div>
                    <ProofBadge status={f.proof_status} />
                  </header>
                  <nav aria-label={`Bagian temuan ${f.id}`} className="border-t border-line px-3 py-1.5">
                    <ul className="flex flex-wrap items-center gap-0.5">
                      {chips(f.id, !!f.claim_id).map(([label, anchor]) => (
                        <li key={anchor}><a href={`#${anchor}`} className="block rounded-md px-2.5 py-1 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-subtle hover:text-ink">{label}</a></li>
                      ))}
                    </ul>
                  </nav>
                </Card>
                <Section id={`${f.id}-std`} title="Standar yang dipakai"><StandardBlock r={r} /></Section>
                <Section id={`${f.id}-klaim`} title="Klaim dan bukti pelaksanaan"><ClaimEvidenceBlock r={r} /></Section>
                <Section id={`${f.id}-peserta`} title="Pernyataan peserta" open={r.pack.facts.length + r.pack.requests.length > 0} badge={<Tag t="muted">{r.pack.facts.length + r.pack.requests.length}</Tag>}><ParticipantBlock r={r} /></Section>
                <Section id={`${f.id}-dokumen`} title="Dokumen dan catatan dari faskes" open={r.pack.documents.length > 0} badge={<Tag t="muted">{r.pack.documents.length}</Tag>}><DocumentsBlock r={r} me={me} /></Section>
                <Section id={`${f.id}-bukti`} title="Bukti tertaut" badge={<Tag t={r.pack.readiness.supports ? "ok" : "warn"}>{r.pack.links.length}</Tag>}><LinksBlock r={r} /></Section>
                <Section id={`${f.id}-cari`} title="Pencarian bukti" open={r.pack.searches.length > 0 || f.proof_status === "under_review"} badge={<Tag t="muted">{r.pack.searches.length}</Tag>}><SearchBlock r={r} me={me} /></Section>
                <Section id={`${f.id}-asisten`} title="Ringkasan asisten (draf)" badge={r.summary ? <Tag t={r.summaryStale ? "warn" : "ok"}>{r.summaryStale ? "Perlu diperbarui" : `Versi ${r.summary.version}`}</Tag> : <Tag t="muted">Belum ada</Tag>}>
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

          <section id="tindakan" className="scroll-mt-20 space-y-3">
            <SectionTitle title="Tindakan perbaikan dan tindak lanjut" />
            <Section title="Tindakan" badge={<Tag t="muted">{room.actions.length}</Tag>}><ActionsBlock actions={room.actions} findings={room.findings} me={me} today={today} /></Section>
          </section>

          <section id="linimasa" className="scroll-mt-20 space-y-3">
            <SectionTitle title="Linimasa dan catatan" />
            <Section title="Linimasa kasus" open={false} badge={<Tag t="muted">{room.timeline.length}</Tag>}><TimelineBlock items={room.timeline} /></Section>
            <Section id="catatan" title="Catatan internal" open={room.notes.length > 0} badge={<Tag t="muted">{room.notes.length}</Tag>}><NotesBlock caseId={c.id} notes={room.notes} findings={room.findings} me={me} /></Section>
          </section>

          {c.lifecycle !== "closed" ? (
            can(me, "case.review") ? (
              <section id="penutupan" aria-label="Penutupan kasus" className="scroll-mt-20">
                <Section title="Tutup kasus" open={canClose} hint="Syarat: semua temuan final dan semua tindakan ditutup.">
                  {canClose ? <CommandForm command="close_case" hidden={{ caseId: c.id }} submit="Tutup kasus" tone="secondary" confirm="Tutup kasus ini?" fields={[{ kind: "textarea", name: "reason", label: "Alasan penutupan (minimal 10 karakter)", rows: 2, required: true }]} /> : <p className="text-sm text-ink-soft">Belum dapat ditutup: {open} temuan belum final, {actionsOpen} tindakan belum ditutup.</p>}
                </Section>
              </section>
            ) : null
          ) : <SimNotice>Kasus ditutup {fmtDateTime(c.closed_at)}. Alasan: {c.close_reason}</SimNotice>}
        </div>
      </div>
    </>
  );
}
