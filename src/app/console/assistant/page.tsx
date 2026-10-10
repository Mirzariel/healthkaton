import Link from "next/link";
import { CommandForm } from "@/components/casework/CommandForm";
import { Disclose } from "@/components/casework/CaseRoomParts";
import { Tag } from "@/components/casework/parts";
import { AiModeBadge, Card, EmptyState, Forbidden, PageHeader, ProofBadge, SectionTitle, SimNotice, Stat } from "@/components/ui";
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
        purpose="Menggantikan autopilot lama. Asisten menyusun ringkasan bukti dan menyarankan langkah pemeriksaan; petugas menerima, mengubah, atau tidak memakainya dengan alasan. Tidak ada keputusan otomatis." />
      <SimNotice>
        {liveAvailable() ? "Penyedia model dikonfigurasi di server: ringkasan baru memakai AI langsung, dengan fallback aturan bila panggilan gagal atau keluarannya ditolak validator." : "Tidak ada kunci penyedia model di server ini, sehingga ringkasan disusun oleh penyusun berbasis aturan dan diberi label \"Simulasi\". Itu bukan inferensi model AI."}
      </SimNotice>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Saran menunggu keputusan" value={inbox.pending.length} tone={inbox.pending.length ? "warn" : "default"} hint="Tidak ada yang berjalan sebelum petugas memutuskan" />
        <Stat label="Saran sudah diputuskan" value={total} hint={`${decided("accepted")} diterima · ${decided("modified")} diubah · ${decided("dismissed")} tidak dipakai`} />
        <Stat label="Ringkasan dibuat" value={inbox.summaries.reduce((a, b) => a + b.n, 0)} hint={`${modes("live")} AI langsung · ${modes("simulated")} simulasi · ${modes("fallback")} fallback`} />
        <Stat label="Temuan belum punya ringkasan" value={inbox.withoutSummary.length} hint="Hanya temuan yang belum final" />
      </div>

      <section className="mt-8 space-y-3" aria-labelledby="batas">
        <SectionTitle title="Batas peran asisten" id="batas" />
        <Card className="p-4">
          <ul className="list-disc space-y-1 pl-5 text-sm">{ASSISTANT_LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
          <div className="mt-4 rounded-lg bg-paper/70 p-3">
            <p className="text-sm font-semibold">Pilihan keputusan klaim dipisahkan dari temuan</p>
            <p className="mt-1 text-sm text-ink-soft">Empat pilihan di bawah hanya dicatat petugas sebagai SIMULASI pada panel khusus di ruang kasus, setelah pembuktian temuan selesai. Asisten tidak memilihnya, dan tidak ada pembayaran, koreksi klaim, atau sanksi yang dijalankan.</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">{Object.values(CLAIM_REVIEW_LABEL).map((o) => <li key={o.label} className="rounded-lg border border-line bg-card px-3 py-2 text-sm"><span className="font-semibold">{o.label}</span><br /><span className="text-xs text-ink-soft">{o.hint}</span></li>)}</ul>
          </div>
        </Card>
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="saran">
        <SectionTitle title="Saran yang menunggu keputusan" id="saran" hint="Saran klarifikasi dan pencarian bukti diputuskan di ruang kasus karena membutuhkan isian. Saran lain dapat diputuskan langsung di sini." />
        {inbox.pending.length === 0 ? <Card><EmptyState title="Tidak ada saran yang menunggu" >Buat ringkasan pada temuan di bawah atau di ruang kasus untuk memperoleh saran.</EmptyState></Card> : (
          <ul className="space-y-3">
            {inbox.pending.map((s) => (
              <li key={s.id} className="rounded-xl border border-line bg-card p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{SUGGESTION_KIND_LABEL[s.kind].label}</span><AiModeBadge mode={s.summary_mode as "live" | "simulated" | "fallback"} /><ProofBadge status={s.proof_status as ProofStatus} /><span className="font-mono text-xs text-muted">{s.id}</span></div>
                <p className="mt-1 text-xs text-muted">{s.facility_name.replace(" (simulasi)", "")} · <Link className="underline underline-offset-4" href={`/console/cases/${caseOf(db, s.finding_id)}#${s.finding_id}-asisten`}>{s.finding_title}</Link></p>
                <p className="mt-2">{s.text}</p>
                <div className="mt-3 flex flex-wrap items-start gap-2">
                  <Link href={`/console/cases/${caseOf(db, s.finding_id)}#${s.finding_id}-asisten`} className="rounded-lg border border-line bg-card px-3 py-1.5 font-semibold hover:border-ink/40">Buka di ruang kasus</Link>
                  {canWork && (s.kind === "participant_confirmation" || s.kind === "record_gap") && <CommandForm command="decide_suggestion" hidden={{ suggestionId: s.id, decision: "accepted" }} submit="Terima" tone="secondary" compact />}
                  {canWork && <Disclose label="Tidak dipakai"><CommandForm command="decide_suggestion" hidden={{ suggestionId: s.id, decision: "dismissed" }} submit="Tandai tidak dipakai" tone="secondary" fields={[{ kind: "text", name: "reason", label: "Alasan (wajib)", required: true }]} /></Disclose>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {inbox.withoutSummary.length > 0 && canWork && (
        <section className="mt-8 space-y-3" aria-labelledby="belum">
          <SectionTitle title="Temuan yang belum punya ringkasan" id="belum" />
          <Card className="divide-y divide-line">
            {inbox.withoutSummary.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0"><p className="font-medium">{f.title}</p><p className="text-xs text-muted"><span className="font-mono">{f.id}</span> · {f.facility_name.replace(" (simulasi)", "")}</p></div>
                <CommandForm command="generate_summary" hidden={{ findingId: f.id }} submit="Buat ringkasan" tone="secondary" compact doneMessage="Ringkasan dibuat." />
              </div>
            ))}
          </Card>
        </section>
      )}

      <section className="mt-8 space-y-3" aria-labelledby="adopsi">
        <SectionTitle title="Bagaimana saran dipakai petugas" id="adopsi" hint="Angka ini memperlihatkan seberapa sering saran diterima, diubah, atau tidak dipakai. Bukan ukuran mutu petugas atau akurasi model." />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <caption className="sr-only">Keputusan petugas atas saran asisten menurut jenis saran</caption>
            <thead className="text-xs text-muted"><tr><th className="p-3">Jenis saran</th><th className="p-3">Menunggu</th><th className="p-3">Diterima</th><th className="p-3">Diubah</th><th className="p-3">Tidak dipakai</th><th className="p-3">Digantikan</th></tr></thead>
            <tbody className="divide-y divide-line">
              {kinds.map((k) => <tr key={k}><td className="p-3 font-medium">{SUGGESTION_KIND_LABEL[k].label}</td>{["proposed", "accepted", "modified", "dismissed", "superseded"].map((st) => <td key={st} className="p-3 tabular-nums">{n(k, st)}</td>)}</tr>)}
            </tbody>
          </table>
        </Card>
        {inbox.recent.length > 0 && (
          <Card className="divide-y divide-line">
            {inbox.recent.map((s) => (
              <div key={s.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><Tag t={SUGGESTION_STATE_LABEL[s.state].tone}>{SUGGESTION_STATE_LABEL[s.state].label}</Tag><span className="font-medium">{SUGGESTION_KIND_LABEL[s.kind].label}</span><span className="text-xs text-muted">{s.decided_by?.split(":")[1]} · {fmtDateTime(s.decided_at)}</span></div>
                <p className="text-xs text-muted">{s.finding_title}</p>
                {s.decision_reason && <p className="text-xs text-ink-soft">Alasan: {s.decision_reason}</p>}
              </div>
            ))}
          </Card>
        )}
      </section>
    </>
  );
}

function caseOf(db: ReturnType<typeof getDb>, findingId: string) {
  return (db.prepare("SELECT case_id FROM findings WHERE id = ?").get(findingId) as { case_id: string }).case_id;
}
