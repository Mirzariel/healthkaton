import Link from "next/link";
import { CommandForm } from "@/components/casework/CommandForm";
import { Disclose } from "@/components/casework/CaseRoomParts";
import { Tag } from "@/components/casework/parts";
import { Inset, RecordId, rowLink } from "@/components/console/Parts";
import { AiModeBadge, Card, CardHeader, EmptyState, Forbidden, PageHeader, ProofBadge, SectionTitle, SimNotice, Stat, TableCard } from "@/components/ui";
import { can } from "@/lib/auth/principal";
import { liveAvailable } from "@/lib/ai/invocations";
import { ASSISTANT_LIMITS, CLAIM_REVIEW_LABEL, SUGGESTION_KIND_LABEL, SUGGESTION_STATE_LABEL } from "@/lib/casework/labels";
import { assistantInbox } from "@/lib/casework/queries";
import { lapseIfDue } from "@/lib/casework/workflow";
import { fmtDateTime } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getPrincipal } from "@/lib/server";
import type { ProofStatus } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const me = await getPrincipal("konsol");
  if (!can(me, "ai.view")) return <Forbidden need="ai.view" />;
  const db = getDb();
  lapseIfDue(db);
  const inbox = assistantInbox(db, me);
  const decided = (s: string) => inbox.decided.find((d) => d.state === s)?.n ?? 0;
  const total = decided("accepted") + decided("modified") + decided("dismissed");
  const modes = (m: string) => inbox.summaries.find((x) => x.mode === m)?.n ?? 0;
  const canWork = can(me, "case.work");
  const kinds = Object.keys(SUGGESTION_KIND_LABEL);
  const n = (kind: string, state: string) => inbox.byKind.find((x) => x.kind === kind && x.state === state)?.n ?? 0;

  return (
    <>
      <PageHeader title="Asisten AI (peninjauan)" eyebrow="Kerja"
        purpose="Asisten menyarankan; petugas menerima, mengubah, atau menolak dengan alasan." />
      <SimNotice>
        {liveAvailable() ? "AI langsung aktif; bila panggilan gagal atau ditolak validator, ringkasan memakai aturan (fallback)." : "Tanpa kunci model: ringkasan disusun berbasis aturan dan berlabel \"Simulasi\", bukan inferensi AI."}
      </SimNotice>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Saran menunggu keputusan" value={inbox.pending.length} tone={inbox.pending.length ? "warn" : "default"} hint="Belum ada yang dijalankan" />
        <Stat label="Saran sudah diputuskan" value={total} hint={`${decided("accepted")} diterima · ${decided("modified")} diubah · ${decided("dismissed")} tidak dipakai`} />
        <Stat label="Ringkasan dibuat" value={inbox.summaries.reduce((a, b) => a + b.n, 0)} hint={`${modes("live")} AI langsung · ${modes("simulated")} simulasi · ${modes("fallback")} fallback`} />
        <Stat label="Temuan belum punya ringkasan" value={inbox.withoutSummary.length} hint="Hanya temuan yang belum final" />
      </div>

      <section className="mt-10 space-y-3" aria-labelledby="saran">
        <SectionTitle title="Saran yang menunggu keputusan" id="saran" hint="Saran klarifikasi dan pencarian diputuskan di ruang kasus; lainnya bisa di sini." />
        {inbox.pending.length === 0 ? <Card><EmptyState title="Tidak ada saran yang menunggu">Buat ringkasan pada temuan di bawah atau di ruang kasus untuk memperoleh saran.</EmptyState></Card> : (
          <Card elevated>
            <ul className="divide-y divide-line">
              {inbox.pending.map((s) => {
                const caseId = caseOf(db, s.finding_id);
                return (
                  <li key={s.id} className="px-5 py-4 text-[14px]">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                      <span className="font-semibold text-ink">{SUGGESTION_KIND_LABEL[s.kind].label}</span>
                      <AiModeBadge mode={s.summary_mode as "live" | "simulated" | "fallback"} />
                      <ProofBadge status={s.proof_status as ProofStatus} />
                      <RecordId>{s.id}</RecordId>
                    </div>
                    <p className="mt-1.5 text-[13px] text-muted">{s.facility_name.replace(" (simulasi)", "")} · <Link className={rowLink} href={`/console/cases/${caseId}#${s.finding_id}-asisten`}>{s.finding_title}</Link></p>
                    <p className="mt-2 max-w-3xl leading-relaxed text-ink-soft">{s.text}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Link href={`/console/cases/${caseId}#${s.finding_id}-asisten`} className="btn btn-secondary btn-sm">Buka di ruang kasus</Link>
                      {canWork && (s.kind === "participant_confirmation" || s.kind === "record_gap") && <CommandForm command="decide_suggestion" hidden={{ suggestionId: s.id, decision: "accepted" }} submit="Terima" tone="secondary" compact />}
                    </div>
                    {canWork && <div className="mt-2"><Disclose label="Tidak dipakai" quiet><CommandForm command="decide_suggestion" hidden={{ suggestionId: s.id, decision: "dismissed" }} submit="Tandai tidak dipakai" tone="secondary" fields={[{ kind: "text", name: "reason", label: "Alasan (wajib)", required: true }]} /></Disclose></div>}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      {inbox.withoutSummary.length > 0 && canWork && (
        <section className="mt-10 space-y-3" aria-labelledby="belum">
          <SectionTitle title="Temuan yang belum punya ringkasan" id="belum" />
          <Card className="divide-y divide-line">
            {inbox.withoutSummary.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[14px]">
                <div className="min-w-0"><p className="font-medium text-ink">{f.title}</p><p className="mt-0.5 text-[12.5px] text-muted"><RecordId>{f.id}</RecordId> · {f.facility_name.replace(" (simulasi)", "")}</p></div>
                <CommandForm command="generate_summary" hidden={{ findingId: f.id }} submit="Buat ringkasan" tone="secondary" compact doneMessage="Ringkasan dibuat." />
              </div>
            ))}
          </Card>
        </section>
      )}

      <section className="mt-10 space-y-3" aria-labelledby="adopsi">
        <SectionTitle title="Bagaimana saran dipakai petugas" id="adopsi" hint="Bukan ukuran mutu petugas atau akurasi model." />
        <TableCard label="Keputusan petugas atas saran asisten">
          <table className="w-full min-w-[34rem] text-left text-[13.5px]">
            <caption className="sr-only">Keputusan petugas atas saran asisten menurut jenis saran</caption>
            <thead><tr><th className="px-4 py-2.5">Jenis saran</th><th className="px-4 py-2.5 text-right">Menunggu</th><th className="px-4 py-2.5 text-right">Diterima</th><th className="px-4 py-2.5 text-right">Diubah</th><th className="px-4 py-2.5 text-right">Tidak dipakai</th><th className="px-4 py-2.5 text-right">Digantikan</th></tr></thead>
            <tbody>
              {kinds.map((k) => <tr key={k}><td className="px-4 py-3 font-medium text-ink">{SUGGESTION_KIND_LABEL[k].label}</td>{["proposed", "accepted", "modified", "dismissed", "superseded"].map((st) => <td key={st} className="px-4 py-3 text-right tabular-nums">{n(k, st)}</td>)}</tr>)}
            </tbody>
          </table>
        </TableCard>
        {inbox.recent.length > 0 && (
          <Card>
            <CardHeader title="Keputusan terbaru" />
            <ul className="divide-y divide-line">
              {inbox.recent.map((s) => (
                <li key={s.id} className="px-5 py-3 text-[14px]">
                  <div className="flex flex-wrap items-center gap-2"><Tag t={SUGGESTION_STATE_LABEL[s.state].tone}>{SUGGESTION_STATE_LABEL[s.state].label}</Tag><span className="font-medium text-ink">{SUGGESTION_KIND_LABEL[s.kind].label}</span><span className="text-[12.5px] text-muted">{s.decided_by?.split(":")[1]} · {fmtDateTime(s.decided_at)}</span></div>
                  <p className="mt-1 text-[13px] text-muted">{s.finding_title}</p>
                  {s.decision_reason && <p className="mt-0.5 text-[13px] text-ink-soft">Alasan: {s.decision_reason}</p>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section className="mt-10 space-y-3" aria-labelledby="batas">
        <SectionTitle title="Batas peran asisten" id="batas" />
        <Inset className="p-5" flush>
          <ul className="list-disc space-y-1 pl-5 text-[14px] text-ink-soft">{ASSISTANT_LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
          <div className="mt-5 rounded-lg bg-card p-4 ring-1 ring-line">
            <p className="text-[14px] font-semibold text-ink">Pilihan keputusan klaim dipisahkan dari temuan</p>
            <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-ink-soft">Empat pilihan ini hanya dicatat petugas sebagai SIMULASI di ruang kasus. Asisten tidak memilihnya; tidak ada pembayaran, koreksi, atau sanksi.</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">{Object.values(CLAIM_REVIEW_LABEL).map((o) => <li key={o.label} className="rounded-lg border border-line bg-card px-3.5 py-2.5"><span className="text-[13.5px] font-semibold text-ink">{o.label}</span><br /><span className="text-[12.5px] text-ink-soft">{o.hint}</span></li>)}</ul>
          </div>
        </Inset>
      </section>
    </>
  );
}

function caseOf(db: ReturnType<typeof getDb>, findingId: string) {
  return (db.prepare("SELECT case_id FROM findings WHERE id = ?").get(findingId) as { case_id: string }).case_id;
}
