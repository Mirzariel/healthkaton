import { notFound } from "next/navigation";
import { AiModeBadge, Card, EmptyState, Forbidden, PageHeader, Pill, SectionTitle } from "@/components/ui";
import { sessionTrace } from "@/lib/ai/admin";
import { can } from "@/lib/auth/principal";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/idem";
import { SESSION_LABEL, STAGE_LABEL, TONE_CLASS, type SessionStatus, type Stage } from "@/lib/labels";
import { getPrincipal } from "@/lib/server";

export const dynamic = "force-dynamic";

type Trace = ReturnType<typeof sessionTrace>;
const SELECTED_BY: Record<string, string> = { rules: "aturan", ai: "AI memilih dari kandidat", fallback: "aturan (fallback)" };
const KIND: Record<string, string> = { core: "inti", clarification: "klarifikasi", prerequisite: "prasyarat" };
const PROP_STATE: Record<string, string> = { proposed: "menunggu konfirmasi", confirmed: "dikonfirmasi", corrected: "diubah peserta", dismissed: "ditolak peserta" };
const PROP_TONE: Record<string, keyof typeof TONE_CLASS> = { proposed: "warn", confirmed: "ok", corrected: "info", dismissed: "muted" };

export default async function TracePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getPrincipal("konsol");
  if (!can(me, "ai.view")) return <Forbidden need="ai.view" />;
  const { id } = await params;
  let t: Trace;
  try {
    t = sessionTrace(getDb(), me, id);
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  }
  const s = t.session as Record<string, unknown>;
  const activeFacts = t.facts.filter((f) => f.status === "active");
  return (
    <>
      <PageHeader
        eyebrow="Jejak turn"
        title={`Sesi ${s.id as string}`}
        purpose={`${s.pseudonym as string} · ${s.facility_name as string} · ${STAGE_LABEL[s.stage as Stage]} · ${SESSION_LABEL[s.status as SessionStatus]}${s.end_reason ? ` (${s.end_reason as string})` : ""}`}
        crumbs={[{ label: "Dasbor AI", href: "/console/ai" }, { label: "Sesi", href: "/console/ai/sessions" }, { label: s.id as string }]}
      >
        {s.ai_mode_last ? <AiModeBadge mode={s.ai_mode_last as "live" | "simulated" | "fallback"} /> : null}
      </PageHeader>
      <div className="mb-6 flex flex-wrap gap-2 text-xs">
        <Pill className={TONE_CLASS.muted}>revisi {s.revision as number}</Pill>
        <Pill className={TONE_CLASS.muted}>inti {s.core_asked as number}/{s.budget_core as number}</Pill>
        <Pill className={TONE_CLASS.muted}>klarifikasi {s.clarif_asked as number}/{s.budget_clarif as number}</Pill>
        {s.respondent_role === "companion" && <Pill className={TONE_CLASS.info}>dijawab pendamping</Pill>}
        {s.uses_draft ? <Pill className={TONE_CLASS.warn} title="Butir standar yang dipakai belum divalidasi pemilik proses">memakai butir draft</Pill> : null}
        {t.session.indicator_versions.map((v: string) => <Pill key={v} className="bg-line font-mono text-ink-soft">{v}</Pill>)}
      </div>

      <section className="space-y-3">
        <SectionTitle title="Giliran" hint="Urutan pertanyaan, jawaban, dan apa yang diproses untuk tiap giliran." />
        {t.turns.length === 0 ? <Card><EmptyState title="Belum ada giliran" /></Card> : (
          <ol className="space-y-3">
            {t.turns.map((turn) => {
              const x = turn as Record<string, unknown> & { processed_by: Trace["invocations"]; proposals: Record<string, unknown>[]; selected_invocation: Trace["invocations"][number] | null };
              return (
                <li key={x.id as string}>
                  <Card className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold">Giliran {x.seq as number}</span>
                      <Pill className={TONE_CLASS.muted}>{KIND[x.question_kind as string]}</Pill>
                      <Pill className={TONE_CLASS.muted} title="Siapa yang memilih pertanyaan ini">dipilih: {SELECTED_BY[x.selected_by as string]}</Pill>
                      {x.text_source !== "bank" && <Pill className={TONE_CLASS.info}>redaksi: {x.text_source === "ai_phrase" ? "disarankan AI (lolos pemeriksaan)" : "templat"}</Pill>}
                      {x.needs_rephrase ? <Pill className={TONE_CLASS.warn}>perlu diulang</Pill> : null}
                    </div>
                    <div>
                      <p className="text-sm"><span className="text-xs text-muted">Pertanyaan ({x.question_id as string}): </span>{x.question_text as string}</p>
                      {x.selection_reason ? <p className="mt-0.5 text-xs text-ink-soft">Alasan pemilihan: {x.selection_reason as string}</p> : null}
                    </div>
                    <div className="rounded-lg bg-paper px-3 py-2 text-sm">
                      {x.answer_text || x.answer_choice ? (
                        <>
                          <span className="text-xs text-muted">Jawaban{x.answer_choice ? " (pilihan)" : " (kalimat bebas)"}: </span>
                          {(x.answer_text as string) ?? (x.answer_choice as string)}
                        </>
                      ) : <span className="text-ink-soft">Belum dijawab.</span>}
                    </div>
                    {x.processed_by.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-ink-soft">Pemrosesan AI</p>
                        {x.processed_by.map((inv) => (
                          <div key={inv.id} className="rounded-lg border border-line p-2.5 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <AiModeBadge mode={inv.mode as "live" | "simulated" | "fallback"} />
                              <span className="font-mono text-muted">{inv.id}</span>
                              <span className="text-ink-soft">{inv.prompt_version}{inv.model ? ` · ${inv.model}` : ""} · {inv.latency_ms ?? 0} ms · status {inv.status}{inv.retries ? ` · ${inv.retries} ulang` : ""}</span>
                              {inv.cost_usd !== null && <span className="text-ink-soft">est. US$ {inv.cost_usd.toFixed(5)}</span>}
                            </div>
                            {inv.fallback_reason && <p className="mt-1 text-warn">Alasan fallback: {inv.fallback_reason}</p>}
                            {inv.validation && (
                              <p className="mt-1 text-ink-soft">
                                Validator: skema {inv.validation.schema_ok === false ? "GAGAL" : "lolos"}, {inv.validation.accepted ?? 0} saran lolos, {inv.validation.rejected?.length ?? 0} ditolak.
                                {inv.validation.next_issue ? ` Pilihan pertanyaan berikut ditolak: ${inv.validation.next_issue}.` : ""}
                                {inv.validation.phrase_issue ? ` Redaksi saran ditolak: ${inv.validation.phrase_issue}.` : ""}
                              </p>
                            )}
                            {inv.validation?.rejected?.map((r, i) => <p key={i} className="mt-0.5 text-danger">Ditolak: {r.slot} = {r.value} ({r.reason})</p>)}
                            <a href={`/api/ai/invocations/${inv.id}`} className="mt-1 inline-block font-semibold text-brand underline underline-offset-2">Lihat permintaan dan respons lengkap (JSON)</a>
                          </div>
                        ))}
                      </div>
                    )}
                    {x.proposals.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-ink-soft">Saran fakta</p>
                        <ul className="divide-y divide-line rounded-lg border border-line text-xs">
                          {x.proposals.map((pr) => (
                            <li key={pr.id as string} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2.5">
                              <span className="font-mono">{pr.slot as string}{pr.subject ? `[${pr.subject as string}]` : ""} = {pr.value as string}</span>
                              <Pill className={TONE_CLASS[pr.validation === "accepted" ? PROP_TONE[pr.state as string] : "danger"]}>{pr.validation === "accepted" ? PROP_STATE[pr.state as string] : "ditolak validator"}</Pill>
                              <Pill className={TONE_CLASS.muted}>asal: {pr.origin as string}</Pill>
                              {pr.quote ? <span className="text-ink-soft">kutipan: “{pr.quote as string}”</span> : null}
                              {pr.reject_reason ? <span className="text-danger">{pr.reject_reason as string}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <SectionTitle title="Fakta peserta" hint="Fakta tidak pernah dihapus; koreksi menggantikan dan menyimpan jejak asal." />
          <Card className="overflow-x-auto">
            {t.facts.length === 0 ? <EmptyState title="Belum ada fakta" /> : (
              <table className="w-full text-left text-xs">
                <thead className="text-muted"><tr><th className="p-2.5">Slot</th><th>Nilai</th><th>Asal</th><th>Status</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {t.facts.map((f) => (
                    <tr key={f.id as string} className={f.status === "superseded" ? "text-muted line-through" : ""}>
                      <td className="p-2.5 font-mono">{f.slot as string}{f.subject ? `[${f.subject as string}]` : ""}</td>
                      <td>{f.value as string}</td>
                      <td>{f.origin as string}{f.supersedes_id ? ` ← ${f.supersedes_id as string}` : ""}</td>
                      <td>{f.status === "active" ? "aktif" : "digantikan"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <p className="text-xs text-muted">{activeFacts.length} fakta aktif dari {t.facts.length} tercatat.</p>
        </div>
        <div className="space-y-3">
          <SectionTitle title="Temuan dan permintaan bantuan" hint="Temuan dari survei berstatus sinyal sampai ditinjau petugas." />
          <Card className="p-4 text-sm">
            {t.findings.length === 0 ? <p className="text-ink-soft">Tidak ada temuan dari sesi ini.</p> : (
              <ul className="divide-y divide-line">
                {t.findings.map((f) => <li key={f.id as string} className="py-1.5"><span className="font-mono text-xs text-muted">{f.id as string}</span> {f.title as string} <Pill className={TONE_CLASS.muted}>{f.proof_status as string}</Pill></li>)}
              </ul>
            )}
            {t.helps.length > 0 && (
              <ul className="mt-3 divide-y divide-line border-t border-line pt-2">
                {t.helps.map((h) => <li key={h.id as string} className="py-1.5 text-xs"><strong>Bantuan {h.status === "open" ? "terbuka" : "ditangani"}</strong>: {h.reason as string}</li>)}
              </ul>
            )}
          </Card>
          <SectionTitle title="Audit sesi" />
          <Card className="p-4">
            {t.audit.length === 0 ? <p className="text-sm text-ink-soft">Tidak ada entri.</p> : (
              <ul className="space-y-1 text-xs">{t.audit.map((a) => <li key={a.id as number} className="flex gap-2"><span className="font-mono text-muted">{(a.ts as string).slice(0, 19)}</span><span>{a.action as string}</span><span className="text-muted">{a.actor as string}</span></li>)}</ul>
            )}
          </Card>
        </div>
      </section>
    </>
  );
}
