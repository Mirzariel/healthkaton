import { notFound } from "next/navigation";
import { Inset } from "@/components/analytics/blocks";
import { AiModeBadge, Card, EmptyState, Forbidden, PageHeader, Pill, Section, SectionTitle, StatusPill, TableCard } from "@/components/ui";
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

function Meta({ k, children, className = "" }: { k: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-caption text-muted">{k}</dt>
      <dd className="mt-0.5 text-body-sm text-ink">{children}</dd>
    </div>
  );
}

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
        purpose={`${s.pseudonym as string} di ${s.facility_name as string}. Tahap ${STAGE_LABEL[s.stage as Stage]}, status ${SESSION_LABEL[s.status as SessionStatus]}.`}
        crumbs={[{ label: "Dasbor AI", href: "/console/ai" }, { label: "Sesi", href: "/console/ai/sessions" }, { label: s.id as string }]}
      >
        {s.ai_mode_last ? <AiModeBadge mode={s.ai_mode_last as "live" | "simulated" | "fallback"} /> : null}
      </PageHeader>

      <Inset className="px-5 py-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          <Meta k="Revisi sesi"><span className="tabular-nums">{s.revision as number}</span></Meta>
          <Meta k="Pertanyaan inti"><span className="tabular-nums">{s.core_asked as number} dari anggaran {s.budget_core as number}</span></Meta>
          <Meta k="Klarifikasi"><span className="tabular-nums">{s.clarif_asked as number} dari anggaran {s.budget_clarif as number}</span></Meta>
          <Meta k="Versi indikator" className="col-span-2 md:col-span-1">
            {t.session.indicator_versions.length ? (
              <details className="group"><summary className="cursor-pointer text-body-sm text-ink-soft hover:text-ink">{t.session.indicator_versions.length} versi</summary>
                <span className="mt-1.5 flex flex-wrap gap-1">{t.session.indicator_versions.map((v: string) => <Pill key={v} className={`max-w-full font-mono ${TONE_CLASS.muted}`}><span className="truncate">{v}</span></Pill>)}</span>
              </details>
            ) : <span className="text-muted">—</span>}
          </Meta>
          {s.end_reason ? <Meta k="Alasan berakhir"><span title={s.end_reason as string}>{(s.end_reason as string).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}</span></Meta> : null}
        </dl>
        {(s.respondent_role === "companion" || !!s.uses_draft) && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3.5">
            {s.respondent_role === "companion" && <StatusPill tone="info">dijawab pendamping</StatusPill>}
            {s.uses_draft ? <StatusPill tone="warn" title="Butir standar yang dipakai belum divalidasi pemilik proses">memakai butir draft</StatusPill> : null}
          </div>
        )}
      </Inset>

      <Section className="mt-10">
        <SectionTitle title="Giliran" />
        {t.turns.length === 0 ? <Card><EmptyState title="Belum ada giliran" /></Card> : (
          <ol className="space-y-3">
            {t.turns.map((turn) => {
              const x = turn as Record<string, unknown> & { processed_by: Trace["invocations"]; proposals: Record<string, unknown>[]; selected_invocation: Trace["invocations"][number] | null };
              return (
                <li key={x.id as string}>
                  <Card>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-line px-5 py-3">
                      <span className="text-body-sm font-semibold text-ink">Giliran {x.seq as number}</span>
                      <Pill className={TONE_CLASS.muted}>{KIND[x.question_kind as string]}</Pill>
                      <Pill className={TONE_CLASS.muted} title="Siapa yang memilih pertanyaan ini">dipilih: {SELECTED_BY[x.selected_by as string]}</Pill>
                      {x.text_source !== "bank" && <Pill className={TONE_CLASS.info}>redaksi: {x.text_source === "ai_phrase" ? "disarankan AI (lolos pemeriksaan)" : "templat"}</Pill>}
                      {x.needs_rephrase ? <Pill className={TONE_CLASS.warn}>perlu diulang</Pill> : null}
                    </div>
                    <div className="space-y-4 px-5 py-4">
                      <div>
                        <p className="text-caption text-muted">Pertanyaan <span className="font-mono">({x.question_id as string})</span></p>
                        <p className="mt-0.5 text-body leading-relaxed text-ink">{x.question_text as string}</p>
                        {x.selection_reason ? <p className="mt-1 text-caption text-ink-soft">Alasan pemilihan: {x.selection_reason as string}</p> : null}
                      </div>
                      <div className="rounded-lg border-l-2 border-line-strong bg-subtle/70 px-3.5 py-2.5">
                        {x.answer_text || x.answer_choice ? (
                          <>
                            <p className="text-caption text-muted">Jawaban{x.answer_choice ? " (pilihan)" : " (kalimat bebas)"}</p>
                            <p className="mt-0.5 text-body-sm text-ink">{(x.answer_text as string) ?? (x.answer_choice as string)}</p>
                          </>
                        ) : <p className="text-body-sm text-ink-soft">Belum dijawab.</p>}
                      </div>

                      {x.processed_by.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-caption font-semibold text-ink">Pemrosesan AI</p>
                          {x.processed_by.map((inv) => (
                            <div key={inv.id} className="rounded-lg border border-line p-3 text-caption">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                <AiModeBadge mode={inv.mode as "live" | "simulated" | "fallback"} />
                                <span className="font-mono text-code text-muted">{inv.id}</span>
                                {inv.cost_usd !== null && <span className="tabular-nums text-ink-soft">est. US$ {inv.cost_usd.toFixed(5)}</span>}
                              </div>
                              <p className="mt-1.5 text-ink-soft">
                                <span className="font-mono text-code">{inv.prompt_version}</span>{inv.model ? <>, model <span className="font-mono text-code">{inv.model}</span></> : null}. <span className="tabular-nums">{inv.latency_ms ?? 0} ms</span>, status {inv.status}{inv.retries ? `, ${inv.retries} ulang` : ""}.
                              </p>
                              {inv.fallback_reason && <p className="mt-1.5 text-warn">Alasan fallback: {inv.fallback_reason}</p>}
                              {inv.validation && (
                                <p className="mt-1.5 text-ink-soft">
                                  Validator: skema {inv.validation.schema_ok === false ? "GAGAL" : "lolos"}, {inv.validation.accepted ?? 0} saran lolos, {inv.validation.rejected?.length ?? 0} ditolak.
                                  {inv.validation.next_issue ? ` Pilihan pertanyaan berikut ditolak: ${inv.validation.next_issue}.` : ""}
                                  {inv.validation.phrase_issue ? ` Redaksi saran ditolak: ${inv.validation.phrase_issue}.` : ""}
                                </p>
                              )}
                              {inv.validation?.rejected?.map((r, i) => <p key={i} className="mt-1 text-danger">Ditolak: <span className="font-mono text-code">{r.slot} = {r.value}</span> ({r.reason})</p>)}
                              <a href={`/api/ai/invocations/${inv.id}`} className="link mt-2 inline-block text-caption">Lihat permintaan dan respons lengkap (JSON)</a>
                            </div>
                          ))}
                        </div>
                      )}

                      {x.proposals.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-caption font-semibold text-ink">Saran fakta</p>
                          <ul className="divide-y divide-line rounded-lg border border-line text-caption">
                            {x.proposals.map((pr) => (
                              <li key={pr.id as string} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                                <span className="break-all font-mono text-code text-ink">{pr.slot as string}{pr.subject ? `[${pr.subject as string}]` : ""} = {pr.value as string}</span>
                                <Pill className={TONE_CLASS[pr.validation === "accepted" ? PROP_TONE[pr.state as string] : "danger"]}>{pr.validation === "accepted" ? PROP_STATE[pr.state as string] : "ditolak validator"}</Pill>
                                <Pill className={TONE_CLASS.muted}>asal: {pr.origin as string}</Pill>
                                {pr.quote ? <span className="text-ink-soft">kutipan: “{pr.quote as string}”</span> : null}
                                {pr.reject_reason ? <span className="text-danger">{pr.reject_reason as string}</span> : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      <Section className="mt-10">
        <div className="grid gap-x-6 gap-y-10 lg:grid-cols-2">
          <div className="min-w-0 space-y-4">
            <SectionTitle title="Fakta peserta" hint="Fakta tidak dihapus; koreksi menggantikan." />
            <TableCard label="Fakta peserta">
              {t.facts.length === 0 ? <EmptyState title="Belum ada fakta" /> : (
                <table className="w-full text-left text-caption">
                  <thead><tr><th className="px-4 py-2.5">Slot</th><th className="px-4 py-2.5">Nilai</th><th className="px-4 py-2.5">Asal</th><th className="px-4 py-2.5">Status</th></tr></thead>
                  <tbody>
                    {t.facts.map((f) => (
                      <tr key={f.id as string} className={f.status === "superseded" ? "text-muted line-through" : ""}>
                        <td className="px-4 py-2.5 font-mono text-code">{f.slot as string}{f.subject ? `[${f.subject as string}]` : ""}</td>
                        <td className="px-4 py-2.5">{f.value as string}</td>
                        <td className="px-4 py-2.5">{f.origin as string}{f.supersedes_id ? ` ← ${f.supersedes_id as string}` : ""}</td>
                        <td className="px-4 py-2.5">{f.status === "active" ? "aktif" : "digantikan"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TableCard>
            <p className="text-caption text-muted"><span className="tabular-nums">{activeFacts.length}</span> fakta aktif dari <span className="tabular-nums">{t.facts.length}</span> tercatat.</p>
          </div>

          <div className="min-w-0 space-y-4">
            <SectionTitle title="Temuan dan permintaan bantuan" hint="Berstatus sinyal sampai ditinjau petugas." />
            <Card>
              {t.findings.length === 0 ? <p className="px-5 py-4 text-body-sm text-ink-soft">Tidak ada temuan dari sesi ini.</p> : (
                <ul className="divide-y divide-line">
                  {t.findings.map((f) => (
                    <li key={f.id as string} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-body-sm">
                      <span className="font-mono text-code text-muted">{f.id as string}</span>
                      <span className="min-w-0 flex-1">{f.title as string}</span>
                      <Pill className={TONE_CLASS.muted}>{f.proof_status as string}</Pill>
                    </li>
                  ))}
                </ul>
              )}
              {t.helps.length > 0 && (
                <ul className="divide-y divide-line border-t border-line">
                  {t.helps.map((h) => <li key={h.id as string} className="px-5 py-2.5 text-body-sm"><strong className="font-semibold">Bantuan {h.status === "open" ? "terbuka" : "ditangani"}</strong>: {h.reason as string}</li>)}
                </ul>
              )}
            </Card>

            <SectionTitle title="Audit sesi" />
            <Card>
              {t.audit.length === 0 ? <p className="px-5 py-4 text-body-sm text-ink-soft">Tidak ada entri.</p> : (
                <ul className="divide-y divide-line">
                  {t.audit.map((a) => (
                    <li key={a.id as number} className="px-5 py-2.5 text-caption">
                      <p className="flex flex-wrap items-baseline gap-x-2"><span className="font-medium text-ink">{a.action as string}</span><span className="text-muted">{a.actor as string}</span></p>
                      <p className="font-mono text-code text-muted">{(a.ts as string).slice(0, 19)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </Section>
    </>
  );
}
