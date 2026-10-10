import type { ReactNode } from "react";
import { AiModeBadge, Card, Pill, ProofBadge, SimNotice, StatusPill } from "@/components/ui";
import { can, type Principal } from "@/lib/auth/principal";
import { ANSWER_LABEL, CAUSE_LABEL, TONE_CLASS } from "@/lib/labels";
import {
  CLAIM_REVIEW_LABEL, CLARIFICATION_LABEL, DIRECTION_LABEL, DISPUTE_LABEL, FOLLOWUP_LABEL, OUTCOME_LABEL, SEARCH_RESULT_LABEL, SLOT_LABEL, SOURCE_LABEL, SUGGESTION_KIND_LABEL, SUGGESTION_STATE_LABEL, ASSISTANT_LIMITS,
} from "@/lib/casework/labels";
import type { ActionRow, DecisionRow, FindingRoom } from "@/lib/casework/queries";
import { SECTION_TITLES, type SourceRef, type SuggestionRow } from "@/lib/casework/summary";
import { PROOF_FINAL } from "@/lib/domain/transitions";
import { fmtDate, fmtDateTime, rupiah } from "@/lib/dates";
import { CommandForm, type FieldDef } from "./CommandForm";
import { Tag, Quote } from "./parts";

/* Bagian-bagian ruang kasus. Semua server component; formulir memakai CommandForm (klien) ke satu pintu perintah.
   Tombol hanya ditampilkan bila peran berwenang, tetapi server tetap menegakkan wewenang di setiap perintah. */

export function Section({ id, title, hint, children, open = true, badge }: { id?: string; title: string; hint?: ReactNode; children: ReactNode; open?: boolean; badge?: ReactNode }) {
  return (
    <details id={id} open={open} className="group rounded-xl border border-line bg-card">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
        <span className="text-base font-semibold tracking-tight">{title}</span>
        <span className="flex items-center gap-2">{badge}<span aria-hidden className="text-xs text-muted group-open:hidden">buka</span><span aria-hidden className="hidden text-xs text-muted group-open:inline">tutup</span></span>
      </summary>
      <div className="space-y-3 border-t border-line px-4 py-4">
        {hint && <p className="text-sm text-ink-soft">{hint}</p>}
        {children}
      </div>
    </details>
  );
}

export function Disclose({ label, children, tone = "secondary" }: { label: string; children: ReactNode; tone?: "secondary" | "primary" }) {
  return (
    <details className="rounded-lg border border-line bg-paper/60">
      <summary className={`cursor-pointer list-none px-3 py-1.5 text-sm font-semibold ${tone === "primary" ? "text-brand" : ""}`}>{label}</summary>
      <div className="border-t border-line p-3">{children}</div>
    </details>
  );
}

const refText = (r: SourceRef) => `${r.label}${r.quote ? ` — "${r.quote}"` : ""}`;
function Refs({ refs }: { refs: SourceRef[] }) {
  if (!refs.length) return null;
  return <p className="mt-1 text-xs text-muted">Sumber: {refs.map((r, i) => <span key={`${r.type}:${r.id}:${i}`} className="mr-2"><span className="font-mono">{r.id}</span> {refText(r)}</span>)}</p>;
}

/* ---------- Standar ---------- */
export function StandardBlock({ r }: { r: FindingRoom }) {
  const i = r.pack.indicator;
  if (!i) return <p className="text-sm text-ink-soft">Temuan ini berasal dari pencocokan episode dan klaim, tanpa butir standar mutu. Dasarnya adalah sinyal di bawah.</p>;
  return (
    <div className="space-y-2 text-sm">
      <p><span className="font-semibold">{i.title}</span> <span className="text-muted">({i.indicator_id})</span></p>
      <p className="text-ink-soft">{i.standard_name}, versi <span className="font-mono">{i.standard_version}</span>, status <Tag t={i.standard_status === "approved" ? "ok" : "warn"}>{i.standard_status === "approved" ? "Disetujui tim" : i.standard_status === "draft" ? "Draft" : i.standard_status === "reviewed" ? "Ditinjau" : i.standard_status}</Tag></p>
      {i.source ? (
        <p className="text-ink-soft">Sumber: {i.source.title}{i.source.publisher ? ` (${i.source.publisher})` : ""}{i.locator ? `, ${i.locator}` : ""}. Validasi: <Tag t={i.source.validation_status === "validated" ? "ok" : "warn"}>{i.source.validation_status === "validated" ? "Tervalidasi" : "Belum selesai"}</Tag></p>
      ) : <p className="text-ink-soft">Sumber butir belum dicatat.</p>}
      <p className="text-xs text-muted">Butir yang belum divalidasi pemilik proses tidak boleh dipakai sebagai putusan; hasilnya hanya bahan peninjauan.</p>
    </div>
  );
}

/* ---------- Klaim vs bukti ---------- */
export function ClaimEvidenceBlock({ r }: { r: FindingRoom }) {
  const { pack } = r;
  const stateTone = { tersedia: "ok", kurang: "warn", bertentangan: "danger" } as const;
  const stateText = { tersedia: "Catatan tertaut", kurang: "Catatan belum tertaut", bertentangan: "Catatan tidak selaras" } as const;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        Perawatan {pack.episode.kind === "RITL" ? "rawat inap" : "rawat jalan"} {fmtDate(pack.episode.admit_at)} s.d. {fmtDate(pack.episode.discharge_at)}{pack.episode.dx_text ? `, ${pack.episode.dx_text}` : ""}.
        {pack.claim && <> Klaim <span className="font-mono">{pack.claim.claim_no}</span>, kelompok {pack.claim.group_code ?? "-"}, nilai paket {rupiah(pack.claim.amount)} ({pack.claim.status}).</>}
      </p>
      {pack.related && <p className="text-sm text-ink-soft">Dibandingkan dengan klaim <span className="font-mono">{pack.related.claim_no}</span> pada episode <span className="font-mono">{pack.related.episode_id}</span> ({rupiah(pack.related.amount)}).</p>}
      {pack.services.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Layanan pada rincian dan status catatan pelaksanaannya</caption>
            <thead className="bg-paper/70 text-xs text-muted"><tr><th className="p-2">Layanan</th><th className="p-2">Waktu</th><th className="p-2">Pelaksana</th><th className="p-2 text-right">Rincian</th><th className="p-2">Catatan pelaksanaan</th></tr></thead>
            <tbody className="divide-y divide-line">
              {pack.services.map((s) => (
                <tr key={s.id} className={s.flagged ? "bg-warn-soft/40" : ""}>
                  <td className="p-2"><span className="font-medium">{s.name}</span> <span className="font-mono text-xs text-muted">{s.code}</span></td>
                  <td className="p-2 whitespace-nowrap">{fmtDateTime(s.performed_at)}</td>
                  <td className="p-2">{s.performer}</td>
                  <td className="p-2 text-right tabular-nums">{rupiah(s.amount)}</td>
                  <td className="p-2">{s.needs_record ? <><Tag t={stateTone[s.state]}>{stateText[s.state]}</Tag>{s.reasons.length > 0 && <p className="mt-1 text-xs text-ink-soft">{s.reasons.join(" ")}</p>}</> : <span className="text-xs text-muted">Tidak memerlukan lembar tersendiri</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-ink-soft">Tidak ada rincian layanan pada temuan ini.</p>}
      {pack.claim && <SimNotice>Detail biaya bukan komponen klaim. Nilai klaim adalah nilai paket yang ditetapkan terpisah, sehingga jumlah rincian di atas tidak dijumlahkan atau dibandingkan dengan nilai klaim.</SimNotice>}
      {pack.signals.length > 0 && (
        <div>
          <p className="text-xs font-medium text-ink-soft">Dasar sinyal (skor {r.finding.score}, hanya untuk mengurutkan)</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{pack.signals.map((s) => <li key={s.key}>{s.label}</li>)}</ul>
        </div>
      )}
      {r.finding.limit_text && <p className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info">Batas penafsiran: {r.finding.limit_text}</p>}
    </div>
  );
}

/* ---------- Pernyataan peserta ---------- */
export function ParticipantBlock({ r }: { r: FindingRoom }) {
  const { facts, requests } = r.pack;
  if (!facts.length && !requests.length) return <p className="text-sm text-ink-soft">Belum ada jawaban survei atau laporan peserta yang tertaut pada episode ini. Ketiadaan jawaban bukan bukti apa pun.</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Identitas peserta tidak ditampilkan di sini. Jawaban "tidak ingat" atau "tidak paham" bernilai nol.</p>
      <ul className="space-y-2">
        {facts.map((f) => (
          <li key={f.id} className={`rounded-lg border px-3 py-2 text-sm ${f.status === "superseded" ? "border-line bg-paper/60 text-muted" : "border-line bg-card"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{SLOT_LABEL[f.slot] ?? f.slot.replaceAll("_", " ")}</span>
              <Tag t={f.meta ? "muted" : f.value === "yes" ? "ok" : f.value === "no" ? "warn" : "info"}>{ANSWER_LABEL[f.value] ?? f.value.replaceAll("_", " ")}</Tag>
              {f.meta && <span className="text-xs text-muted">bernilai nol</span>}
              {f.status === "superseded" && <Tag t="muted">Dikoreksi peserta</Tag>}
              {f.supersedes_id && f.status === "active" && <Tag t="info">Koreksi peserta</Tag>}
              <span className="text-xs text-muted">{f.respondent_role === "companion" ? "Pendamping" : "Peserta"} · survei {f.stage}</span>
            </div>
            {f.quote && <p className="mt-1 text-xs text-ink-soft">"{f.quote}"</p>}
          </li>
        ))}
        {requests.map((q) => (
          <li key={q.id} className="rounded-lg border border-line bg-card px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2"><span className="font-medium">Laporan peserta</span><Tag t="info">{q.category}</Tag><span className="text-xs text-muted">{fmtDate(q.created_at)}</span></div>
            <p className="mt-1">{q.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Dokumen faskes dan bukti tertaut ---------- */
const linkFields = (note = ""): FieldDef[] => [
  { kind: "select", name: "direction", label: "Arah penilaian bukti", options: [{ value: "supports", label: DIRECTION_LABEL.supports.label }, { value: "contradicts", label: DIRECTION_LABEL.contradicts.label }, { value: "neutral", label: DIRECTION_LABEL.neutral.label }], defaultValue: "neutral" },
  { kind: "textarea", name: "quote", label: "Kutipan dari bukti (opsional)", rows: 2 },
  { kind: "number", name: "page", label: "Halaman (opsional)", min: 1, max: 999 },
  { kind: "textarea", name: "note", label: "Catatan penilaian (wajib)", rows: 2, required: true, defaultValue: note, hint: "Jelaskan mengapa bukti ini mendukung, bertentangan, atau netral. Arah dinilai petugas, bukan mesin." },
];

export function DocumentsBlock({ r, me }: { r: FindingRoom; me: Principal }) {
  const { documents, records } = r.pack;
  const editable = !PROOF_FINAL.includes(r.finding.proof_status) && can(me, "evidence.review");
  const linkedDocs = new Set(r.pack.links.map((l) => l.document_id));
  const linkedRecs = new Set(r.pack.links.map((l) => l.evidence_id));
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold">Dokumen dari faskes</h4>
        {documents.length === 0 ? <p className="mt-1 text-sm text-ink-soft">Belum ada dokumen yang diunggah faskes untuk temuan ini.</p> : (
          <ul className="mt-2 space-y-3">
            {documents.map((d) => (
              <li key={d.id} className="rounded-lg border border-line px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">{d.name}</a>
                  <span className="font-mono text-xs text-muted">{d.id}</span>
                  <Tag t={d.processing_status === "needs_manual_transcription" ? "warn" : d.processing_status === "reviewed" ? "ok" : "info"}>
                    {d.processing_status === "needs_manual_transcription" ? "Perlu transkripsi manual" : d.processing_status === "text_extracted" ? "Teks terbaca" : d.processing_status === "reviewed" ? "Sudah ditelaah" : d.processing_status}
                  </Tag>
                  <span className="text-xs text-muted">{(d.size / 1024).toFixed(1)} KB · {fmtDateTime(d.created_at)}</span>
                  {linkedDocs.has(d.id) && <Tag t="ok">Tertaut sebagai bukti</Tag>}
                </div>
                {d.extraction && <Quote by={`Ekstraksi ${d.extraction.engine === "manual" ? "manual" : "teks"} · status ${d.extraction.status === "proposed" ? "usulan, menunggu telaah" : d.extraction.status === "confirmed" ? "dikonfirmasi" : d.extraction.status === "corrected" ? "dikoreksi" : "ditolak"}`}>{d.extraction.excerpt}{d.extraction.excerpt.length >= 400 ? "…" : ""}</Quote>}
                {d.processing_status === "needs_manual_transcription" && can(me, "evidence.review") && (
                  <div className="mt-2"><Disclose label="Transkripsikan secara manual">
                    <CommandForm command="transcribe_document" hidden={{ documentId: d.id }} submit="Simpan transkripsi" fields={[{ kind: "textarea", name: "text", label: "Isi dokumen yang terbaca", rows: 4, required: true, hint: "Ketik apa adanya. Tanpa OCR, sistem tidak membaca gambar. Transkripsi tersimpan sebagai usulan, dan berkas asli tidak berubah." }]} />
                  </Disclose></div>
                )}
                {d.extraction && d.extraction.status === "proposed" && d.extraction.engine !== "manual" && can(me, "evidence.review") && (
                  <div className="mt-2"><Disclose label="Telaah hasil ekstraksi">
                    <CommandForm command="review_extraction" hidden={{ extractionId: d.extraction.id }} submit="Simpan telaah" fields={[
                      { kind: "select", name: "action", label: "Hasil telaah", options: [{ value: "confirm", label: "Sesuai dengan dokumen" }, { value: "correct", label: "Perlu dikoreksi" }, { value: "reject", label: "Tidak dapat dipakai" }] },
                      { kind: "textarea", name: "text", label: "Teks koreksi (hanya bila dikoreksi)", rows: 3 },
                    ]} />
                  </Disclose></div>
                )}
                {editable && !linkedDocs.has(d.id) && d.processing_status !== "needs_manual_transcription" && (
                  <div className="mt-2"><Disclose label="Tautkan sebagai bukti">
                    <CommandForm command="link_evidence" hidden={{ findingId: r.finding.id, documentId: d.id }} submit="Tautkan bukti" fields={linkFields()} />
                  </Disclose></div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="text-sm font-semibold">Catatan pelaksanaan pada episode</h4>
        {records.length === 0 ? <p className="mt-1 text-sm text-ink-soft">Tidak ada catatan pelaksanaan pada episode ini.</p> : (
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line text-sm">
            {records.map((rc) => (
              <li key={rc.id} className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{rc.type.replaceAll("_", " ")}</span><span className="font-mono text-xs text-muted">{rc.id}</span><span className="text-xs text-muted">{fmtDateTime(rc.recorded_at)} · {rc.performer}</span>{linkedRecs.has(rc.id) && <Tag t="ok">Tertaut sebagai bukti</Tag>}</div>
                <p className="text-ink-soft">{rc.summary}</p>
                {editable && !linkedRecs.has(rc.id) && <div className="mt-1.5"><Disclose label="Tautkan sebagai bukti"><CommandForm command="link_evidence" hidden={{ findingId: r.finding.id, evidenceId: rc.id }} submit="Tautkan bukti" fields={linkFields()} /></Disclose></div>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {can(me, "evidence.upload") && can(me, "case.work") && <p className="text-xs text-muted">Dokumen yang diserahkan di luar portal dapat diunggah petugas lewat POST /api/casework/upload.</p>}
    </div>
  );
}

export function LinksBlock({ r }: { r: FindingRoom }) {
  const { links, readiness, documents, records } = r.pack;
  const nameOf = (l: (typeof links)[number]) => (l.document_id ? documents.find((d) => d.id === l.document_id)?.name : records.find((x) => x.id === l.evidence_id)?.summary) ?? l.document_id ?? l.evidence_id ?? "bukti";
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-soft">{readiness.supports} mendukung · {readiness.contradicts} bertentangan · {readiness.neutral} netral. Usulan "Terbukti" membutuhkan sedikitnya satu bukti pendukung dan hak jawab faskes yang terpenuhi.</p>
      {links.length === 0 ? <p className="text-sm text-ink-soft">Belum ada bukti yang ditautkan.</p> : (
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.id} className="rounded-lg border border-line px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2"><Tag t={DIRECTION_LABEL[l.direction].tone}>{DIRECTION_LABEL[l.direction].label}</Tag><span className="font-mono text-xs text-muted">{l.id}</span><span className="text-xs text-muted">{fmtDateTime(l.linked_at)}</span></div>
              <p className="mt-1 font-medium">{nameOf(l)}</p>
              {l.quote && <p className="text-xs text-ink-soft">Kutipan: "{l.quote}"{l.page ? ` (hlm. ${l.page})` : ""}</p>}
              {l.note && <p className="text-xs text-ink-soft">Catatan petugas: {l.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SearchBlock({ r, me }: { r: FindingRoom; me: Principal }) {
  const { searches } = r.pack;
  return (
    <div className="space-y-3">
      {searches.length === 0 ? <p className="text-sm text-ink-soft">Belum ada pencarian bukti yang dicatat. "Tidak dapat dibuktikan" baru sah bila pencarian yang tidak menemukan hasil sudah dicatat di sini.</p> : (
        <ul className="divide-y divide-line rounded-lg border border-line text-sm">
          {searches.map((s) => (
            <li key={s.id} className="px-3 py-2"><div className="flex flex-wrap items-center gap-2"><Tag t={s.result === "found" ? "ok" : s.result === "inconsistent" ? "warn" : "muted"}>{SEARCH_RESULT_LABEL[s.result]}</Tag><span className="font-medium">{s.source}</span><span className="text-xs text-muted">{fmtDateTime(s.at)}</span></div><p className="text-ink-soft">{s.query}{s.found_ref ? ` · rujukan ${s.found_ref}` : ""}</p></li>
          ))}
        </ul>
      )}
      {!PROOF_FINAL.includes(r.finding.proof_status) && can(me, "evidence.review") && (
        <Disclose label="Catat pencarian bukti">
          <CommandForm command="record_search" hidden={{ findingId: r.finding.id }} submit="Catat pencarian" fields={[
            { kind: "text", name: "source", label: "Sumber yang dicari", required: true, placeholder: "mis. SIMRS/RME, arsip rekam medis" },
            { kind: "textarea", name: "query", label: "Apa yang dicari", rows: 2, required: true },
            { kind: "select", name: "result", label: "Hasil", options: [{ value: "not_found", label: SEARCH_RESULT_LABEL.not_found }, { value: "found", label: SEARCH_RESULT_LABEL.found }, { value: "inconsistent", label: SEARCH_RESULT_LABEL.inconsistent }] },
            { kind: "text", name: "foundRef", label: "Rujukan hasil (opsional)" },
          ]} />
        </Disclose>
      )}
    </div>
  );
}

/* ---------- Ringkasan asisten ---------- */
export function SummaryBlock({ r, me }: { r: FindingRoom; me: Principal }) {
  const s = r.summary;
  const canWork = can(me, "case.work");
  return (
    <div className="space-y-3">
      <ul className="list-disc space-y-1 pl-5 text-xs text-ink-soft">{ASSISTANT_LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
      {!s ? <p className="text-sm text-ink-soft">Belum ada ringkasan untuk temuan ini.</p> : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <AiModeBadge mode={s.mode} /><span>Versi {s.version}</span><span>{fmtDateTime(s.created_at)}</span>
            <span>{s.mode === "live" ? `Model ${s.model ?? "-"} (${s.provider})` : s.mode === "fallback" ? "Penyusun aturan menggantikan model karena panggilan gagal atau ditolak validator" : "Penyusun berbasis aturan, bukan inferensi model"}</span>
            {s.status === "reviewed" && <Tag t="ok">Sudah dikoreksi petugas</Tag>}
          </div>
          {r.summaryStale && <p role="status" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">Bukti pada temuan ini berubah sejak ringkasan dibuat. Buat ringkasan baru agar sesuai kondisi terkini.</p>}
          {(Object.keys(SECTION_TITLES) as (keyof typeof SECTION_TITLES)[]).map((sec) => {
            const blocks = s.content[sec];
            if (!blocks.length) return null;
            return (
              <div key={sec}>
                <h4 className="text-sm font-semibold">{SECTION_TITLES[sec]}</h4>
                <ul className="mt-1 space-y-2">
                  {blocks.map((b) => {
                    const corr = [...s.corrections].reverse().find((c) => c.block_id === b.id);
                    return (
                      <li key={b.id} className="rounded-lg border border-line px-3 py-2 text-sm">
                        {corr ? (
                          <>
                            <p>{corr.text} <Tag t="ok">Dikoreksi petugas</Tag></p>
                            <p className="mt-1 text-xs text-muted line-through">{b.text}</p>
                            <p className="text-xs text-muted">Alasan koreksi: {corr.note}</p>
                          </>
                        ) : <p>{b.text}</p>}
                        <Refs refs={b.refs} />
                        {canWork && !corr && <div className="mt-1.5"><Disclose label="Koreksi pernyataan ini"><CommandForm command="correct_summary" hidden={{ summaryId: s.id, blockId: b.id }} submit="Simpan koreksi" fields={[{ kind: "textarea", name: "text", label: "Pernyataan yang benar", rows: 2, required: true, defaultValue: b.text }, { kind: "text", name: "note", label: "Alasan koreksi", required: true }]} /></Disclose></div>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </>
      )}
      {canWork && <CommandForm command="generate_summary" hidden={{ findingId: r.finding.id }} submit={s ? "Buat ringkasan baru" : "Buat ringkasan"} tone="secondary" doneMessage="Ringkasan dibuat." />}
    </div>
  );
}

export function SuggestionCard({ s, f, me }: { s: SuggestionRow; f: FindingRoom; me: Principal }) {
  const canWork = can(me, "case.work");
  const k = SUGGESTION_KIND_LABEL[s.kind];
  const st = SUGGESTION_STATE_LABEL[s.state];
  const isOpen = s.state === "proposed";
  return (
    <li className="rounded-lg border border-line px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{k.label}</span><Tag t={st.tone}>{st.label}</Tag><span className="font-mono text-xs text-muted">{s.id}</span></div>
      <p className="mt-1">{s.text}</p>
      <Refs refs={s.refs} />
      {s.final_text && <p className="mt-1 text-xs text-ink-soft">Teks akhir petugas: {s.final_text}</p>}
      {s.decision_reason && <p className="text-xs text-ink-soft">Alasan: {s.decision_reason}</p>}
      {s.decided_by && <p className="text-xs text-muted">Diputuskan {s.decided_by} · {fmtDateTime(s.decided_at)}</p>}
      {isOpen && canWork && (
        <div className="mt-2 space-y-2">
          {s.kind === "clarification_request" && !PROOF_FINAL.includes(f.finding.proof_status) && (
            <Disclose label="Pakai sebagai klarifikasi (periksa dan ubah dulu)" tone="primary">
              <CommandForm command="send_clarification" hidden={{ findingId: f.finding.id, suggestionId: s.id }} submit="Kirim klarifikasi ke faskes" doneMessage="Klarifikasi terkirim." fields={clarificationFields({ issue: s.payload.issue ?? "", docs: s.payload.requestedDocs ?? [], ref: s.payload.minimalRef ?? "" })} />
            </Disclose>
          )}
          {s.kind === "evidence_search" && can(me, "evidence.review") && !PROOF_FINAL.includes(f.finding.proof_status) && (
            <Disclose label="Catat hasil pencarian ini" tone="primary">
              <CommandForm command="record_search" hidden={{ findingId: f.finding.id, suggestionId: s.id }} submit="Catat pencarian" fields={[
                { kind: "text", name: "source", label: "Sumber yang dicari", required: true, defaultValue: s.payload.source ?? "" },
                { kind: "textarea", name: "query", label: "Apa yang dicari", rows: 2, required: true, defaultValue: s.payload.query ?? "" },
                { kind: "select", name: "result", label: "Hasil", options: [{ value: "not_found", label: SEARCH_RESULT_LABEL.not_found }, { value: "found", label: SEARCH_RESULT_LABEL.found }, { value: "inconsistent", label: SEARCH_RESULT_LABEL.inconsistent }] },
              ]} />
            </Disclose>
          )}
          <div className="flex flex-wrap gap-2">
            {(s.kind === "participant_confirmation" || s.kind === "record_gap") && <CommandForm command="decide_suggestion" hidden={{ suggestionId: s.id, decision: "accepted" }} submit="Terima (saya yang menindaklanjuti)" tone="secondary" compact />}
            <Disclose label="Tidak dipakai"><CommandForm command="decide_suggestion" hidden={{ suggestionId: s.id, decision: "dismissed" }} submit="Tandai tidak dipakai" tone="secondary" fields={[{ kind: "text", name: "reason", label: "Alasan (wajib)", required: true }]} /></Disclose>
          </div>
        </div>
      )}
    </li>
  );
}

export const clarificationFields = (d: { issue?: string; docs?: string[]; ref?: string } = {}): FieldDef[] => [
  { kind: "textarea", name: "issue", label: "Hal yang dimintakan penjelasan (bahasa netral)", rows: 4, required: true, defaultValue: d.issue ?? "", hint: "Tulis apa yang belum ditemukan dan apa yang diharapkan dari faskes, tanpa menyimpulkan apa pun." },
  { kind: "lines", name: "requestedDocs", label: "Dokumen yang diminta", defaultValue: d.docs ?? [] },
  { kind: "text", name: "minimalRef", label: "Rujukan minimal perawatan", defaultValue: d.ref ?? "", hint: "Nomor klaim dan tanggal perawatan. Identitas peserta tidak dikirim ke faskes." },
  { kind: "number", name: "dueDays", label: "Tenggat (hari dari sekarang)", defaultValue: 14, min: 1, max: 60 },
];

export function SuggestionsBlock({ r, me }: { r: FindingRoom; me: Principal }) {
  if (!r.suggestions.length) return null;
  const open = r.suggestions.filter((s) => s.state === "proposed");
  const done = r.suggestions.filter((s) => s.state !== "proposed");
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Saran langkah berikutnya <span className="font-normal text-muted">(menunggu keputusan petugas, tidak dijalankan otomatis)</span></h4>
      {open.length === 0 ? <p className="text-sm text-ink-soft">Tidak ada saran yang menunggu.</p> : <ul className="space-y-2">{open.map((s) => <SuggestionCard key={s.id} s={s} f={r} me={me} />)}</ul>}
      {done.length > 0 && <Disclose label={`Riwayat keputusan atas saran (${done.length})`}><ul className="space-y-2">{done.map((s) => <SuggestionCard key={s.id} s={s} f={r} me={me} />)}</ul></Disclose>}
    </div>
  );
}

/* ---------- Klarifikasi ---------- */
export function ClarificationsBlock({ r, me }: { r: FindingRoom; me: Principal }) {
  const { clarifications } = r.pack;
  const final = PROOF_FINAL.includes(r.finding.proof_status);
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">Hak jawab faskes: {r.pack.readiness.replySatisfied ? <Tag t="ok">Terpenuhi</Tag> : <Tag t="warn">Belum terpenuhi</Tag>} <span className="text-xs text-muted">{r.pack.readiness.replyReason}</span></p>
      {clarifications.length === 0 ? <p className="text-sm text-ink-soft">Belum ada klarifikasi yang dikirim ke faskes.</p> : (
        <ul className="space-y-3">
          {clarifications.map((c) => {
            const lab = CLARIFICATION_LABEL[c.status];
            return (
              <li key={c.id} className="rounded-lg border border-line px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{c.id}</span><Tag t={lab.tone} title={lab.hint}>{lab.label}</Tag><span className="text-xs text-muted">dikirim {fmtDateTime(c.sent_at)} · tenggat {fmtDateTime(c.due_at)}</span></div>
                <p className="mt-1 text-ink-soft">{c.issue}</p>
                {c.requested_docs.length > 0 && <p className="text-xs text-muted">Diminta: {c.requested_docs.join("; ")}</p>}
                {c.status === "lapsed" && <p className="mt-1 text-xs text-ink-soft">{lab.hint}</p>}
                {c.messages.filter((m) => m.author_role === "faskes").map((m, i) => <div key={i} className="mt-2"><Quote by={`Jawaban faskes · ${fmtDateTime(m.at)}${m.document_id ? ` · lampiran ${m.document_id}` : ""}`}>{m.text}</Quote></div>)}
                {c.status === "sent" && can(me, "case.work") && <div className="mt-2"><Disclose label="Tarik permintaan"><CommandForm command="withdraw_clarification" hidden={{ clarificationId: c.id }} submit="Tarik permintaan" tone="secondary" fields={[{ kind: "text", name: "reason", label: "Alasan (wajib)", required: true }]} /></Disclose></div>}
              </li>
            );
          })}
        </ul>
      )}
      {!final && can(me, "case.work") && (
        <Disclose label="Kirim klarifikasi baru" tone="primary">
          <CommandForm command="send_clarification" hidden={{ findingId: r.finding.id }} submit="Kirim klarifikasi ke faskes" doneMessage="Klarifikasi terkirim." fields={clarificationFields({ ref: r.pack.claim ? `${r.pack.claim.claim_no}, perawatan mulai ${r.pack.episode.admit_at.slice(0, 10)}` : `${r.pack.episode.id}, perawatan mulai ${r.pack.episode.admit_at.slice(0, 10)}` })} />
        </Disclose>
      )}
    </div>
  );
}

/* ---------- Pembuktian ---------- */
const dec = (d: DecisionRow) => `${d.actor_id.split(":")[1] ?? d.actor_id} · ${fmtDateTime(d.at)}`;

export function ProofBlock({ r, me }: { r: FindingRoom; me: Principal }) {
  const f = r.finding;
  const final = PROOF_FINAL.includes(f.proof_status);
  const rr = r.pack.readiness;
  const searchesNotFound = r.pack.searches.filter((s) => s.result !== "found").length;
  const pend = r.pendingProposal;
  const history = r.decisions.filter((d) => d.kind === "proof_proposal" || d.kind === "proof_approval" || d.kind === "reopen");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><ProofBadge status={f.proof_status} /><span className="text-sm text-ink-soft">Verifikator mengusulkan, reviewer yang berbeda menyetujui. Tenggat klarifikasi yang lewat tidak membuktikan apa pun.</span></div>
      {!final && (
        <ul className="grid gap-1 text-sm sm:grid-cols-3">
          <li className="rounded-lg bg-paper/70 px-3 py-2"><span className="text-xs text-muted">Bukti pendukung tertaut</span><br /><strong>{rr.supports}</strong> {rr.supports ? "" : <Tag t="warn">belum ada</Tag>}</li>
          <li className="rounded-lg bg-paper/70 px-3 py-2"><span className="text-xs text-muted">Hak jawab faskes</span><br />{rr.replySatisfied ? <Tag t="ok">terpenuhi</Tag> : <Tag t="warn">belum</Tag>}</li>
          <li className="rounded-lg bg-paper/70 px-3 py-2"><span className="text-xs text-muted">Pencarian tanpa hasil dicatat</span><br /><strong>{searchesNotFound}</strong> {searchesNotFound ? "" : <span className="text-xs text-muted">(syarat "tidak dapat dibuktikan")</span>}</li>
        </ul>
      )}
      {f.proof_status === "signal" && can(me, "case.work") && <CommandForm command="start_review" hidden={{ findingId: f.id }} submit="Mulai tinjauan" tone="secondary" />}
      {pend && (
        <div className="rounded-lg border border-accent/50 bg-warn-soft/50 px-3 py-2 text-sm">
          <p className="font-semibold">Usulan menunggu persetujuan reviewer: {OUTCOME_LABEL[pend.decision ?? ""] ?? pend.decision}</p>
          <p className="text-ink-soft">{pend.reason}</p>
          <p className="text-xs text-muted">Diusulkan {dec(pend)}</p>
          {can(me, "case.review") ? (
            pend.actor_id === me.id ? <p className="mt-1 text-xs text-warn">Anda pengusul; persetujuan harus dari reviewer lain.</p> : (
              <div className="mt-2"><Disclose label="Putuskan usulan" tone="primary"><CommandForm command="decide_proof" hidden={{ proposalId: pend.id }} submit="Simpan keputusan" fields={[{ kind: "boolean", name: "approve", label: "Keputusan", yes: "Setujui usulan", no: "Tolak usulan" }, { kind: "textarea", name: "note", label: "Catatan keputusan", rows: 2, hint: "Wajib saat menolak." }]} /></Disclose></div>
            )
          ) : <p className="mt-1 text-xs text-muted">Hanya reviewer yang dapat memutuskan.</p>}
        </div>
      )}
      {!final && !pend && f.proof_status !== "awaiting_clarification" && can(me, "case.work") && f.proof_status !== "signal" && (
        <Disclose label="Ajukan usulan hasil pembuktian" tone="primary">
          <CommandForm command="propose_proof" hidden={{ findingId: f.id }} submit="Ajukan usulan" doneMessage="Usulan diajukan ke reviewer." fields={[
            { kind: "select", name: "outcome", label: "Usulan hasil", options: [{ value: "verified", label: "Terbukti" }, { value: "not_verified", label: "Tidak terbukti" }, { value: "inconclusive", label: "Tidak dapat dibuktikan" }] },
            { kind: "textarea", name: "reason", label: "Dasar usulan", rows: 3, required: true, hint: "Sebut buktinya (nomor tautan, dokumen, pencarian). Minimal 15 karakter." },
          ]} />
        </Disclose>
      )}
      {f.proof_status === "awaiting_clarification" && <p className="text-sm text-ink-soft">Temuan menunggu jawaban faskes. Usulan hasil dapat diajukan setelah faskes menjawab atau tenggat lewat.</p>}
      {final && can(me, "case.review") && (
        <Disclose label="Buka ulang temuan (ada bukti baru)"><CommandForm command="reopen_finding" hidden={{ findingId: f.id }} submit="Buka ulang" tone="secondary" fields={[{ kind: "textarea", name: "reason", label: "Alasan membuka ulang", rows: 2, required: true }]} /></Disclose>
      )}
      {history.length > 0 && (
        <details className="text-sm"><summary className="cursor-pointer font-medium">Riwayat usulan dan keputusan ({history.length})</summary>
          <ul className="mt-2 space-y-1.5">{history.map((d) => <li key={d.id} className="rounded-lg bg-paper/70 px-3 py-1.5"><span className="font-medium">{d.kind === "proof_proposal" ? "Usulan" : d.kind === "reopen" ? "Dibuka ulang" : d.decision === "rejected" ? "Usulan ditolak" : "Disetujui"}</span>{d.decision && d.kind !== "proof_approval" && <> · {OUTCOME_LABEL[d.decision] ?? d.decision}</>}{d.kind === "proof_proposal" && <> · <span className="text-xs text-muted">{d.state === "pending" ? "menunggu" : d.state === "approved" ? "disetujui" : "ditolak"}</span></>}<br /><span className="text-ink-soft">{d.reason}</span><br /><span className="text-xs text-muted">{dec(d)}</span></li>)}</ul>
        </details>
      )}
    </div>
  );
}

/* ---------- Penyebab dan eskalasi ---------- */
export function CausesBlock({ r, me }: { r: FindingRoom; me: Principal }) {
  const f = r.finding;
  if (f.proof_status !== "verified") return <p className="text-sm text-ink-soft">Analisis penyebab baru terbuka setelah temuan berstatus "Terbukti". Hasil penyebab ditetapkan manusia; AI tidak menentukannya.</p>;
  const hist = r.decisions.filter((d) => d.kind === "escalation" || d.kind === "fraud_approval");
  const pend = r.pendingEscalation;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {r.causes.length === 0 ? <Tag t="warn">Belum ditetapkan</Tag> : r.causes.map((c) => <Pill key={c} className={TONE_CLASS[c === "suspected_fraud" ? "danger" : "info"]} title={CAUSE_LABEL[c as keyof typeof CAUSE_LABEL]?.hint}>{CAUSE_LABEL[c as keyof typeof CAUSE_LABEL]?.label ?? c}{c === "suspected_fraud" ? " (label, bukan putusan)" : ""}</Pill>)}
      </div>
      {f.causes_note && <p className="text-sm text-ink-soft">Catatan analisis: {f.causes_note}</p>}
      {can(me, "case.cause") && (
        <Disclose label={r.causes.length ? "Ubah analisis penyebab" : "Tetapkan analisis penyebab"} tone="primary">
          <CommandForm command="set_causes" hidden={{ findingId: f.id }} submit="Simpan analisis" fields={[
            { kind: "checks", name: "causes", label: "Penyebab (dapat lebih dari satu)", options: [{ value: "administrative", label: "Administratif (layanan ada, pencatatan gagal)" }, { value: "service_process", label: "Proses pelayanan (gap dari standar)" }], defaultValue: r.causes.filter((c) => c !== "suspected_fraud") },
            { kind: "textarea", name: "note", label: "Catatan analisis", rows: 3, required: true, hint: "Minimal 10 karakter. Pertimbangkan penjelasan alternatif sebelum eskalasi." },
          ]} />
        </Disclose>
      )}
      <div className="rounded-lg border border-line px-3 py-2">
        <p className="text-sm font-semibold">Eskalasi dugaan (dua pihak, hasilnya hanya label)</p>
        <p className="text-xs text-ink-soft">Syarat: terbukti, hak jawab faskes terpenuhi, penyebab alternatif sudah ditimbang. Reviewer mengajukan, auditor (orang dan peran berbeda) menyetujui. Hasilnya label "dugaan", bukan putusan fraud, bukan sanksi.</p>
        {pend && (
          <div className="mt-2 rounded-lg bg-warn-soft/50 px-3 py-2 text-sm"><p className="font-medium">Menunggu persetujuan pihak kedua</p><p className="text-ink-soft">{pend.reason}</p><p className="text-xs text-muted">Diajukan {dec(pend)}</p>
            {me.role === "auditor" && pend.actor_id !== me.id && <div className="mt-2"><Disclose label="Putuskan permintaan eskalasi" tone="primary"><CommandForm command="decide_escalation" hidden={{ requestId: pend.id }} submit="Simpan keputusan" fields={[{ kind: "boolean", name: "approve", label: "Keputusan", yes: "Setujui (label dugaan)", no: "Tolak" }, { kind: "textarea", name: "note", label: "Catatan (wajib)", rows: 2, required: true }]} /></Disclose></div>}
          </div>
        )}
        {!pend && me.role === "reviewer" && !r.causes.includes("suspected_fraud") && r.causes.length > 0 && (
          <div className="mt-2"><Disclose label="Ajukan eskalasi"><CommandForm command="request_escalation" hidden={{ findingId: f.id }} submit="Ajukan eskalasi" tone="secondary" fields={[{ kind: "textarea", name: "reason", label: "Dasar eskalasi (minimal 20 karakter)", rows: 3, required: true }]} /></Disclose></div>
        )}
        {hist.length > 0 && <ul className="mt-2 space-y-1 text-sm">{hist.map((d) => <li key={d.id} className="text-ink-soft"><span className="font-medium text-ink">{d.kind === "escalation" ? "Permintaan" : d.decision === "approved" ? "Disetujui" : "Ditolak"}</span>: {d.reason} <span className="text-xs text-muted">({dec(d)})</span></li>)}</ul>}
      </div>
    </div>
  );
}

/* ---------- Keputusan klaim (simulasi) ---------- */
export function ClaimReviewBlock({ r, me }: { r: FindingRoom; me: Principal }) {
  if (!r.finding.claim_id) return null;
  return (
    <div className="space-y-3">
      <SimNotice>Ini panel terpisah dari status temuan pelayanan. Pilihan di bawah hanya DICATAT sebagai simulasi oleh petugas: tidak ada pembayaran, koreksi klaim, atau sanksi yang dijalankan ke sistem mana pun, dan AI tidak memilihnya.</SimNotice>
      {r.claimReviews.length > 0 && (
        <ul className="space-y-2">{r.claimReviews.map((d) => <li key={d.id} className="rounded-lg border border-line px-3 py-2 text-sm"><div className="flex flex-wrap items-center gap-2"><Tag t="warn">Simulasi</Tag><span className="font-semibold">{CLAIM_REVIEW_LABEL[d.decision as keyof typeof CLAIM_REVIEW_LABEL]?.label ?? d.decision}</span>{d.correction_amount != null && <span>{rupiah(d.correction_amount)}</span>}</div><p className="text-ink-soft">{d.reason}</p><p className="text-xs text-muted">{dec(d)}</p></li>)}</ul>
      )}
      {!r.canClaimReview ? <p className="text-sm text-ink-soft">Keputusan klaim dapat dicatat setelah pembuktian temuan selesai.</p> : can(me, "claimreview.record") ? (
        <Disclose label="Catat keputusan klaim (simulasi)">
          <CommandForm command="claim_review" hidden={{ findingId: r.finding.id }} submit="Catat sebagai simulasi" tone="secondary" fields={[
            { kind: "select", name: "option", label: "Pilihan", options: Object.entries(CLAIM_REVIEW_LABEL).map(([value, v]) => ({ value, label: `${v.label}: ${v.hint}` })) },
            { kind: "number", name: "correction", label: "Nilai koreksi (hanya bila koreksi nilai)", min: 0 },
            { kind: "textarea", name: "reason", label: "Alasan (minimal 10 karakter)", rows: 2, required: true },
          ]} />
        </Disclose>
      ) : null}
    </div>
  );
}

/* ---------- Bantahan ---------- */
export function DisputesBlock({ r, me }: { r: FindingRoom; me: Principal }) {
  if (!r.disputes.length) return <p className="text-sm text-ink-soft">Faskes belum mengajukan bantahan atas temuan ini.</p>;
  return (
    <ul className="space-y-3">
      {r.disputes.map((d) => {
        const l = DISPUTE_LABEL[d.status];
        return (
          <li key={d.id} className="rounded-lg border border-line px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{d.id}</span><Tag t={l.tone}>{l.label}</Tag><span className="text-xs text-muted">{fmtDateTime(d.created_at)}</span></div>
            <Quote by="Bantahan faskes">{d.text}</Quote>
            {d.response && <p className="mt-1 text-ink-soft">Tanggapan: {d.response}</p>}
            {d.status === "open" && can(me, "dispute.resolve") && (
              <div className="mt-2"><Disclose label="Tanggapi bantahan" tone="primary"><CommandForm command="resolve_dispute" hidden={{ disputeId: d.id }} submit="Simpan tanggapan" fields={[
                { kind: "select", name: "decision", label: "Tanggapan", options: [{ value: "accepted", label: "Diterima (membuka ulang bila temuan sudah final)" }, { value: "rejected", label: "Tidak diterima" }, { value: "noted", label: "Dicatat saja" }] },
                { kind: "textarea", name: "response", label: "Alasan tanggapan (minimal 10 karakter)", rows: 3, required: true },
              ]} /></Disclose></div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Tindakan perbaikan ---------- */
export function ActionsBlock({ actions, findings, me, today }: { actions: ActionRow[]; findings: FindingRoom[]; me: Principal; today: string }) {
  const verified = findings.filter((f) => f.finding.proof_status === "verified");
  const label = { open: "Direncanakan", in_progress: "Dikerjakan", resolved: "Selesai dikerjakan", follow_up_pending: "Menunggu tindak lanjut", closed: "Ditutup" } as const;
  return (
    <div className="space-y-3">
      {actions.length === 0 && <p className="text-sm text-ink-soft">Belum ada tindakan perbaikan. Tindakan disusun faskes (atau petugas) setelah temuan terbukti. Hasilnya diukur ulang dan dikonfirmasi peserta sebelum ditutup.</p>}
      <ul className="space-y-3">
        {actions.map((a) => (
          <li id={a.id} key={a.id} className="rounded-lg border border-line px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{a.id}</span><Tag t={a.status === "closed" ? "ok" : a.status === "follow_up_pending" ? "info" : "warn"}>{label[a.status as keyof typeof label]}</Tag><span className="text-xs text-muted">pemilik {a.owner ?? "-"} · target {fmtDate(a.target_date)}{a.status === "open" || a.status === "in_progress" ? (a.target_date && a.target_date.slice(0, 10) < today ? " · lewat target" : "") : ""}</span></div>
            <p className="mt-1">{a.description}</p>
            {a.remeasure_plan && <p className="text-xs text-ink-soft">Rencana pengukuran ulang: {a.remeasure_plan}</p>}
            {a.result && <p className="text-xs text-ink-soft">Hasil dilaporkan: {a.result}</p>}
            {a.followups.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {a.followups.map((u) => (
                  <li key={u.id} className="rounded-lg bg-paper/70 px-3 py-1.5">
                    <span className="font-medium">{FOLLOWUP_LABEL[u.kind] ?? u.kind}</span> · <Tag t={u.status === "done" ? "ok" : u.status === "skipped" ? "muted" : "warn"}>{u.status === "done" ? (u.outcome === "resolved" ? "Selesai: teratasi" : "Selesai: masih ada kendala") : u.status === "skipped" ? "Dilewati" : "Menunggu"}</Tag> <span className="text-xs text-muted">jatuh tempo {fmtDate(u.due_at)}</span>
                    {u.note && <p className="text-xs text-ink-soft">{u.note}</p>}
                    {u.status === "pending" && u.kind !== "participant_confirmation" && can(me, "case.work") && (
                      <div className="mt-1.5"><Disclose label="Selesaikan tindak lanjut"><CommandForm command="complete_followup" hidden={{ followUpId: u.id }} submit="Simpan" fields={[{ kind: "select", name: "outcome", label: "Hasil", options: [{ value: "resolved", label: "Teratasi" }, { value: "still_issue", label: "Masih ada kendala (pengerjaan dibuka kembali)" }] }, { kind: "textarea", name: "note", label: "Catatan hasil", rows: 2 }]} /></Disclose></div>
                    )}
                    {u.status === "pending" && u.kind === "participant_confirmation" && <p className="mt-1 text-xs text-muted">Menunggu konfirmasi dari peserta di aplikasi peserta. Petugas tidak dapat mengonfirmasi atas nama peserta.</p>}
                  </li>
                ))}
              </ul>
            )}
            {a.status === "open" && can(me, "case.work") && <div className="mt-2"><CommandForm command="start_action" hidden={{ actionId: a.id }} submit="Tandai mulai dikerjakan" tone="secondary" /></div>}
            {a.status === "resolved" && can(me, "case.work") && (
              <div className="mt-2"><Disclose label="Minta tindak lanjut (konfirmasi peserta dan pengukuran ulang)" tone="primary"><CommandForm command="request_followup" hidden={{ actionId: a.id }} submit="Minta tindak lanjut" fields={[{ kind: "text", name: "participantId", label: "Nomor peserta yang dikonfirmasi (opsional)", placeholder: "mis. P-0104", hint: "Kosongkan bila hanya pengukuran ulang." }, { kind: "number", name: "dueDays", label: "Jatuh tempo (hari dari sekarang)", defaultValue: 30, min: 1, max: 120 }]} /></Disclose></div>
            )}
          </li>
        ))}
      </ul>
      {verified.length > 0 && can(me, "case.work") && (
        <Disclose label="Susun tindakan perbaikan" tone="primary">
          <CommandForm command="create_action" submit="Buat tindakan" doneMessage="Tindakan dibuat dan faskes diberi tahu." fields={[
            { kind: "select", name: "findingId", label: "Untuk temuan", options: verified.map((f) => ({ value: f.finding.id, label: `${f.finding.id}: ${f.finding.title.slice(0, 70)}` })) },
            { kind: "textarea", name: "description", label: "Tindakan perbaikan", rows: 3, required: true },
            { kind: "text", name: "owner", label: "Pemilik tindakan", required: true },
            { kind: "date", name: "targetDate", label: "Target selesai", required: true },
            { kind: "textarea", name: "remeasurePlan", label: "Rencana pengukuran ulang", rows: 2 },
          ]} />
        </Disclose>
      )}
    </div>
  );
}

/* ---------- Linimasa, catatan ---------- */
export function TimelineBlock({ items }: { items: { at: string; kind: string; kindLabel: string; text: string; actor?: string | null }[] }) {
  return (
    <ol className="relative space-y-0 border-l border-line pl-4 text-sm">
      {items.map((t, i) => (
        <li key={i} className="relative pb-3">
          <span aria-hidden className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-brand/60" />
          <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted tabular-nums">{fmtDateTime(t.at)}</span><StatusPill tone="muted">{t.kindLabel}</StatusPill></div>
          <p>{t.text}{t.actor ? <span className="text-xs text-muted"> · {t.actor.split(":")[1] ?? t.actor}</span> : null}</p>
        </li>
      ))}
    </ol>
  );
}

export function NotesBlock({ caseId, notes, findings, me }: { caseId: string; notes: { id: number; finding_id: string | null; author_id: string; text: string; at: string }[]; findings: FindingRoom[]; me: Principal }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Catatan internal tidak pernah terlihat oleh faskes maupun peserta.</p>
      {notes.length === 0 ? <p className="text-sm text-ink-soft">Belum ada catatan.</p> : <ul className="space-y-2">{notes.map((n) => <li key={n.id} className="rounded-lg border border-line px-3 py-2 text-sm"><p>{n.text}</p><p className="text-xs text-muted">{n.author_id.split(":")[1]} · {fmtDateTime(n.at)}{n.finding_id ? ` · ${n.finding_id}` : ""}</p></li>)}</ul>}
      {can(me, "case.work") && (
        <CommandForm command="add_note" hidden={{ caseId }} submit="Tambah catatan" tone="secondary" fields={[
          { kind: "select", name: "findingId", label: "Terkait temuan (opsional)", options: [{ value: "", label: "Seluruh kasus" }, ...findings.map((f) => ({ value: f.finding.id, label: f.finding.id }))] },
          { kind: "textarea", name: "text", label: "Catatan", rows: 2, required: true },
        ]} />
      )}
    </div>
  );
}

export { Card, Quote };
