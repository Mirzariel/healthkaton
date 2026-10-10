import type Database from "better-sqlite3";
import { z } from "zod";
import { appendAudit } from "../audit";
import { assertCan, type Principal } from "../auth/principal";
import { assertCaseAccess, getFinding, type FindingRow } from "../cases/core";
import { AI_SCHEMA_VERSION, type AiMode } from "../ai/contract";
import { getActiveConfig, logInvocation, resolveMode, type AiConfig } from "../ai/invocations";
import { nowPrecise } from "../clock";
import { dayOf } from "../dates";
import { json, nextId } from "../db";
import { PROOF_FINAL } from "../domain/transitions";
import { DomainError } from "../idem";
import { ANSWER_LABEL, FINDING_LABEL, findForbiddenTerms } from "../labels";
import { buildPack, packFingerprint, type EvidencePack, type FactRow } from "./pack";
import { ASSISTANT_LIMITS } from "./labels";

/* Ringkasan bukti kasus (master prompt 6.6 dan 8.5). Selalu DRAF yang dapat dikoreksi petugas; setiap pernyataan membawa rujukan sumber.
   Dua penyusun: (1) deterministik berbasis aturan = mode "simulated"; (2) model bahasa (summary-live.ts) = mode "live", dengan fallback ke (1).
   Asisten tidak menentukan terbukti/tidaknya temuan, penyebab, pembayaran, sanksi, resep, atau diagnosis. */

export const SUMMARY_PROMPT_VERSION = "case-summary-v1";
export const RULES_PROVIDER = "rules-v1";

export type RefType = "fact" | "request" | "service" | "record" | "claim" | "clarification" | "link" | "document" | "search" | "indicator" | "signal";
export interface SourceRef { type: RefType; id: string; label: string; quote?: string }
export interface Block { id: string; text: string; refs: SourceRef[] }
export const SUGGESTION_KINDS = ["clarification_request", "evidence_search", "participant_confirmation", "record_gap"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];
export interface SuggestionDraft {
  kind: SuggestionKind;
  text: string;
  payload: { issue?: string; requestedDocs?: string[]; minimalRef?: string; source?: string; query?: string; question?: string; serviceId?: string };
  refs: SourceRef[];
}
export interface SummaryContent {
  participant: Block[];
  basis: Block[];
  facility: Block[];
  supporting: Block[];
  contradicting: Block[];
  contradictions: Block[];
  missing: Block[];
  steps: SuggestionDraft[];
  limits: string[];
}
export const SECTION_TITLES: Record<Exclude<keyof SummaryContent, "steps" | "limits">, string> = {
  participant: "Fakta dari peserta",
  basis: "Dasar sinyal dan catatan yang tersedia",
  facility: "Penjelasan faskes (belum dinilai)",
  supporting: "Bukti tertaut yang mendukung temuan",
  contradicting: "Bukti tertaut yang bertentangan dengan temuan",
  contradictions: "Hal yang belum selaras",
  missing: "Informasi yang belum ada",
};

/* ---------- Aturan bahasa keluaran asisten ---------- */
/** Kalimat yang menyatakan putusan atau penyebab bukan wewenang asisten. Dipakai untuk menolak keluaran model. */
const DECISION_LANGUAGE = /\b(tidak terbukti|sudah terbukti|terbukti (bahwa|salah|bersalah|melakukan)|bersalah|fraud|kecurangan|sanksi|denda|harus (ditolak|dibayar|dikoreksi)|layak (ditolak|dibayar)|penyebab(nya)? (adalah|ialah|utama)|root cause|diagnosis (yang benar|seharusnya)|resep (yang benar|seharusnya))\b/i;
export function assistantTextProblems(text: string): string[] {
  const out: string[] = [];
  const bad = findForbiddenTerms(text);
  if (bad.length) out.push(`istilah tidak netral: ${bad.join(", ")}`);
  if (DECISION_LANGUAGE.test(text)) out.push("memuat bahasa putusan atau penyebab");
  return out;
}

/* ---------- Penyusun deterministik ---------- */
const trunc = (s: string, n = 220) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const fmt = (iso: string) => iso.slice(0, 16).replace("T", " ");
const STAGE: Record<string, string> = { pre: "pra", intra: "intra", post: "pasca", directed: "terarah" };

function slotLabel(slot: string) {
  const known: Record<string, string> = {
    service_performed: "menjalani layanan", medication_receipt: "penerimaan obat untuk dibawa pulang", reported_reason: "alasan yang disampaikan petugas",
    outside_purchase: "membeli obat di luar", out_of_pocket_paid: "membayar sendiri", replacement_arranged: "obat pengganti disediakan faskes", directed_outside_purchase: "diarahkan membeli obat di luar",
  };
  return known[slot] ?? slot.replaceAll("_", " ");
}
function factSentence(pack: EvidencePack, f: FactRow) {
  const who = f.respondent_role === "companion" ? "Pendamping peserta" : "Peserta";
  const v = ANSWER_LABEL[f.value] ?? f.value.replaceAll("_", " ");
  const svc = f.subject ? pack.services.find((s) => s.id === f.subject) : null;
  const about = svc ? ` (${svc.name}, ${svc.code})` : "";
  if (f.meta) return `${who} menjawab "${v}" untuk ${slotLabel(f.slot)}${about} pada survei ${STAGE[f.stage] ?? f.stage}. Jawaban ini bernilai nol: bukan bukti layanan ada ataupun tidak ada.`;
  if (f.status === "superseded") return `${who} semula menjawab "${v}" untuk ${slotLabel(f.slot)}${about}; jawaban ini sudah dikoreksi.`;
  return `${who} menyatakan ${slotLabel(f.slot)}${about}: "${v}" (survei ${STAGE[f.stage] ?? f.stage}).`;
}

export function composeSummary(pack: EvidencePack): SummaryContent {
  const f = pack.finding;
  let n = 0;
  const id = (p: string) => `${p}${++n}`;
  const blk = (p: string, text: string, refs: SourceRef[]): Block => ({ id: id(p), text, refs });
  const out: SummaryContent = { participant: [], basis: [], facility: [], supporting: [], contradicting: [], contradictions: [], missing: [], steps: [], limits: [...ASSISTANT_LIMITS] };
  const isFinal = PROOF_FINAL.includes(f.proof_status);

  // --- fakta peserta ---
  for (const x of pack.facts) {
    out.participant.push(blk("p", factSentence(pack, x), [{ type: "fact", id: x.id, label: `Jawaban survei ${STAGE[x.stage] ?? x.stage}`, quote: x.quote ? trunc(x.quote, 160) : undefined }]));
  }
  for (const r of pack.requests) {
    out.participant.push(blk("p", `Laporan peserta (${r.category}): ${trunc(r.text)}`, [{ type: "request", id: r.id, label: "Laporan layanan peserta", quote: trunc(r.text, 160) }]));
  }

  // --- dasar sinyal dan catatan ---
  if (pack.signals.length) {
    out.basis.push(blk("b", `Sinyal dihitung dari: ${pack.signals.map((s) => s.label).join("; ")}. Skor ${f.score} hanya mengurutkan antrean, bukan menilai faskes.`, [{ type: "signal", id: f.id, label: "Rincian sinyal" }]));
  }
  if (pack.indicator) {
    const i = pack.indicator;
    out.basis.push(blk("b", `Butir standar: ${i.title} (${i.standard_name}, versi ${i.standard_version}, status ${i.standard_status}). ${i.source ? `Sumber ${i.source.id}: validasi ${i.source.validation_status === "validated" ? "selesai" : "belum selesai"}.` : "Sumber butir belum dicatat."}`, [{ type: "indicator", id: i.version_id, label: i.title }]));
  }
  for (const s of pack.services.filter((x) => x.flagged)) {
    out.basis.push(blk("b", `${s.name} (${s.code}, ${fmt(s.performed_at)}): ${s.state === "kurang" ? "belum ada catatan pelaksanaan yang tertaut" : "catatan pelaksanaan ada, tetapi tidak selaras dengan tagihan"}. ${s.reasons.join(" ")}`.trim(), [{ type: "service", id: s.id, label: `${s.name} (${s.code})` }]));
  }
  const okSvc = pack.services.filter((x) => x.needs_record && !x.flagged).length;
  if (okSvc) out.basis.push(blk("b", `${okSvc} layanan lain pada rincian memiliki catatan pelaksanaan yang selaras.`, pack.services.filter((x) => x.needs_record && !x.flagged).slice(0, 4).map((s) => ({ type: "service" as const, id: s.id, label: s.code }))));
  if (pack.claim) out.basis.push(blk("b", `Rincian layanan bersifat informasi. Nilai klaim ${pack.claim.claim_no} adalah nilai paket yang ditetapkan terpisah, sehingga jumlah rincian tidak dibandingkan langsung dengan nilai klaim.`, [{ type: "claim", id: pack.claim.id, label: pack.claim.claim_no }]));

  // --- penjelasan faskes ---
  for (const c of pack.clarifications) {
    if (c.status === "answered" && c.response_text) out.facility.push(blk("f", `Faskes menjawab klarifikasi ${c.id} pada ${fmt(c.answered_at ?? c.sent_at)}: ${trunc(c.response_text, 300)} Arah (mendukung/bertentangan) ditentukan petugas saat menautkan bukti.`, [{ type: "clarification", id: c.id, label: `Jawaban ${c.id}`, quote: trunc(c.response_text, 160) }]));
    else if (c.status === "lapsed") out.facility.push(blk("f", `Klarifikasi ${c.id} melewati tenggat ${fmt(c.due_at)} tanpa jawaban. Hak jawab terpenuhi, tetapi hal ini tidak membuktikan apa pun.`, [{ type: "clarification", id: c.id, label: c.id }]));
    else if (c.status === "sent") out.facility.push(blk("f", `Klarifikasi ${c.id} menunggu jawaban faskes sampai ${fmt(c.due_at)}.`, [{ type: "clarification", id: c.id, label: c.id }]));
  }

  // --- bukti tertaut ---
  for (const l of pack.links) {
    const what = l.document_id ? pack.documents.find((d) => d.id === l.document_id)?.name ?? l.document_id : pack.records.find((r) => r.id === l.evidence_id)?.summary ?? l.evidence_id ?? "bukti";
    const text = `${trunc(String(what), 140)}${l.quote ? ` — kutipan: "${trunc(l.quote, 140)}"` : ""}${l.note ? ` (catatan petugas: ${trunc(l.note, 140)})` : ""}`;
    const ref: SourceRef = { type: "link", id: l.id, label: `Tautan bukti ${l.id}`, quote: l.quote ? trunc(l.quote, 160) : undefined };
    if (l.direction === "supports") out.supporting.push(blk("s", text, [ref]));
    else if (l.direction === "contradicts") out.contradicting.push(blk("c", text, [ref]));
  }

  // --- hal yang belum selaras ---
  const active = pack.facts.filter((x) => x.status === "active" && !x.meta);
  for (const s of pack.services.filter((x) => x.flagged)) {
    const fact = active.find((x) => x.slot === "service_performed" && x.subject === s.id);
    const refs: SourceRef[] = [{ type: "service", id: s.id, label: s.code }];
    if (fact?.value === "yes" && s.state === "kurang") out.contradictions.push(blk("x", `Peserta menyatakan menjalani ${s.name}, sedangkan catatan pelaksanaan belum tertaut. Kedua informasi belum selaras; pencatatan yang belum tertaut juga mungkin penyebabnya.`, [...refs, { type: "fact", id: fact.id, label: "Jawaban peserta" }]));
    if (fact?.value === "no" && s.state === "bertentangan") out.contradictions.push(blk("x", `Peserta menyatakan tidak menjalani ${s.name}, sedangkan ada catatan pelaksanaan yang tidak selaras dengan tagihan. Perlu diperiksa lebih lanjut.`, [...refs, { type: "fact", id: fact.id, label: "Jawaban peserta" }]));
  }
  if (f.signal_active && pack.readiness.contradicts) out.contradictions.push(blk("x", "Ada bukti tertaut yang bertentangan dengan temuan; sinyal dapat gugur setelah dinilai petugas.", pack.links.filter((l) => l.direction === "contradicts").map((l) => ({ type: "link" as const, id: l.id, label: l.id }))));
  for (const d of pack.documents.filter((x) => x.processing_status === "needs_manual_transcription")) {
    out.missing.push(blk("m", `Dokumen "${d.name}" belum dapat dibaca otomatis (tanpa OCR). Transkripsi manual diperlukan sebelum isinya dapat dikutip sebagai bukti.`, [{ type: "document", id: d.id, label: d.name }]));
  }

  // --- informasi yang belum ada ---
  const live = pack.clarifications.filter((c) => c.status !== "withdrawn");
  if (!isFinal) {
    if (!live.length) out.missing.push(blk("m", "Belum ada klarifikasi ke faskes, sehingga hak jawab faskes belum terpenuhi.", []));
    if (!pack.readiness.supports) out.missing.push(blk("m", "Belum ada bukti tertaut yang mendukung temuan. Usulan 'Terbukti' mensyaratkan sedikitnya satu bukti pendukung dan hak jawab yang terpenuhi; keputusan tetap pada petugas dan reviewer.", []));
    if (pack.finding.claim_id || pack.services.some((s) => s.flagged)) {
      for (const s of pack.services.filter((x) => x.state === "kurang")) {
        if (!pack.searches.some((q) => q.query.toLowerCase().includes(s.code.toLowerCase()) || q.query.toLowerCase().includes(s.name.toLowerCase()))) {
          out.missing.push(blk("m", `Belum ada catatan pencarian bukti untuk ${s.name} (${s.code}).`, [{ type: "service", id: s.id, label: s.code }]));
        }
      }
    }
  }
  if ((f.type === "T1" || f.type === "T4") && !pack.facts.length && !pack.requests.length) out.missing.push(blk("m", "Belum ada jawaban atau laporan peserta yang tertaut pada episode ini.", []));
  for (const x of pack.facts.filter((y) => y.meta && y.status === "active")) {
    out.missing.push(blk("m", `Jawaban peserta untuk ${slotLabel(x.slot)} adalah "${ANSWER_LABEL[x.value] ?? x.value}": informasinya belum ada.`, [{ type: "fact", id: x.id, label: "Jawaban peserta" }]));
  }
  if (f.proof_status !== "verified") out.missing.push(blk("m", "Analisis penyebab belum terbuka; baru dapat ditetapkan setelah temuan berstatus 'Terbukti'.", []));

  // --- saran langkah ---
  const mref = `${pack.claim?.claim_no ?? pack.episode.id}, perawatan mulai ${dayOf(pack.episode.admit_at)}`;
  if (!isFinal) {
    for (const s of pack.services.filter((x) => x.state === "kurang")) {
      out.steps.push({
        kind: "evidence_search",
        text: `Periksa SIMRS/RME dan arsip rekam medis faskes untuk lembar tindakan ${s.name} (${s.code}) pada ${fmt(s.performed_at)}, lalu catat hasil pencarian.`,
        payload: { source: "SIMRS/RME dan arsip rekam medis faskes", query: `Lembar tindakan ${s.name} (${s.code}) ${fmt(s.performed_at)}`, serviceId: s.id },
        refs: [{ type: "service", id: s.id, label: s.code }],
      });
      const fact = pack.facts.find((x) => x.slot === "service_performed" && x.subject === s.id && x.status === "active");
      if (!fact || fact.meta) {
        out.steps.push({
          kind: "participant_confirmation",
          text: `Ajukan konfirmasi terarah kepada peserta tentang ${s.name} (${s.code}) pada ${dayOf(s.performed_at)}: "Apakah Anda menjalani layanan ini?" dengan pilihan Ya, Tidak, atau Lupa. Jawaban Lupa tidak dihitung sebagai bukti.`,
          payload: { question: `Apakah Anda menjalani ${s.name} pada ${dayOf(s.performed_at)}?`, serviceId: s.id },
          refs: [{ type: "service", id: s.id, label: s.code }],
        });
      }
    }
    if (!live.length) {
      const docs = f.type === "T1" ? pack.services.filter((x) => x.state !== "tersedia").map((s) => `Lembar tindakan ${s.name} (${s.code})`)
        : f.type === "T2" ? ["Rincian layanan tiap klaim", "Catatan indikasi medis bila perawatan terpisah"]
        : f.type === "T3" ? ["Catatan indikasi medis untuk perawatan ulang", "Resume medis perawatan pertama"]
        : ["Penjelasan alur atau kondisi yang menyebabkan layanan belum terlaksana", "Catatan terkait (mis. ketersediaan, penyerahan, atau komunikasi)"];
      const topic = f.type === "T1" ? "dokumen pelaksanaan layanan yang tercantum pada rincian"
        : f.type === "T2" ? "dua klaim yang tampak serupa"
        : f.type === "T3" ? "dua episode perawatan yang berurutan"
        : (pack.indicator?.title ?? FINDING_LABEL[f.type].short).toLowerCase();
      const issue = f.type === "T4"
        ? `Kami menerima informasi terkait ${topic} pada perawatan yang dirujuk di bawah. Mohon jelaskan kondisi yang terjadi pada perawatan tersebut dan, bila ada, lampirkan catatan yang relevan. Penjelasan Anda akan dipertimbangkan sebelum ada kesimpulan.`
        : `Mohon bantuan penjelasan dan dokumen terkait ${topic} pada perawatan yang dirujuk di bawah. Bila layanan telah dilakukan tetapi dokumen belum tertaut, mohon sebutkan lokasi pencatatannya atau lampirkan salinannya. Kami belum menarik kesimpulan apa pun.`;
      out.steps.push({
        kind: "clarification_request",
        text: `Kirim klarifikasi kepada faskes (hak jawab). Draf kalimat: ${issue}`,
        payload: { issue, requestedDocs: docs, minimalRef: mref },
        refs: [{ type: "signal", id: f.id, label: "Sinyal temuan" }],
      });
    }
    if (live.some((c) => c.status === "lapsed") && !live.some((c) => c.status === "answered")) {
      out.steps.push({
        kind: "evidence_search",
        text: "Klarifikasi melewati tenggat tanpa jawaban. Sebelum mengusulkan 'Tidak dapat dibuktikan', catat pencarian bukti di sumber lain (arsip, sistem pendukung, kunjungan).",
        payload: { source: "Sumber lain di luar SIMRS/RME", query: "Pencarian lanjutan setelah klarifikasi melewati tenggat" },
        refs: live.filter((c) => c.status === "lapsed").map((c) => ({ type: "clarification" as const, id: c.id, label: c.id })),
      });
    }
    for (const d of pack.documents.filter((x) => x.processing_status === "needs_manual_transcription")) {
      out.steps.push({ kind: "record_gap", text: `Transkripsikan secara manual dokumen "${d.name}" agar isinya dapat dikutip sebagai bukti.`, payload: {}, refs: [{ type: "document", id: d.id, label: d.name }] });
    }
    const answered = live.filter((c) => c.status === "answered");
    if (answered.length && !pack.links.length) {
      out.steps.push({ kind: "record_gap", text: "Faskes sudah menjawab. Nilai jawaban dan dokumen terlampir, lalu tautkan sebagai bukti (mendukung, bertentangan, atau netral) beserta catatan.", payload: {}, refs: answered.map((c) => ({ type: "clarification" as const, id: c.id, label: c.id })) });
    }
  }
  return out;
}

/* ---------- Validasi keluaran (berlaku untuk keduanya) ---------- */
const refZ = z.strictObject({ type: z.enum(["fact", "request", "service", "record", "claim", "clarification", "link", "document", "search", "indicator", "signal"]), id: z.string().min(1).max(60), label: z.string().max(160), quote: z.string().max(200).optional() });
const blockZ = z.strictObject({ id: z.string().min(1).max(20), text: z.string().min(1).max(600), refs: z.array(refZ).max(8) });
export const liveSummaryZ = z.strictObject({
  participant: z.array(blockZ).max(10), basis: z.array(blockZ).max(10), facility: z.array(blockZ).max(6), supporting: z.array(blockZ).max(10),
  contradicting: z.array(blockZ).max(10), contradictions: z.array(blockZ).max(10), missing: z.array(blockZ).max(10),
  steps: z.array(z.strictObject({
    kind: z.enum(SUGGESTION_KINDS), text: z.string().min(1).max(700), refs: z.array(refZ).max(8),
    payload: z.strictObject({ issue: z.string().max(900).optional(), requestedDocs: z.array(z.string().max(160)).max(6).optional(), minimalRef: z.string().max(160).optional(), source: z.string().max(160).optional(), query: z.string().max(300).optional(), question: z.string().max(300).optional(), serviceId: z.string().max(40).optional() }),
  })).max(8),
});

/** Kumpulan nomor sumber yang sah untuk satu paket; rujukan di luar kumpulan ini ditolak. */
export function validRefs(pack: EvidencePack): Set<string> {
  const s = new Set<string>();
  const add = (t: RefType, i: string | number | null | undefined) => { if (i !== null && i !== undefined) s.add(`${t}:${i}`); };
  for (const x of pack.facts) add("fact", x.id);
  for (const x of pack.requests) add("request", x.id);
  for (const x of pack.services) add("service", x.id);
  for (const x of pack.records) add("record", x.id);
  if (pack.claim) add("claim", pack.claim.id);
  if (pack.related) add("claim", pack.related.id);
  for (const x of pack.clarifications) add("clarification", x.id);
  for (const x of pack.links) add("link", x.id);
  for (const x of pack.documents) add("document", x.id);
  for (const x of pack.searches) add("search", x.id);
  if (pack.indicator) add("indicator", pack.indicator.version_id);
  add("signal", pack.finding.id);
  return s;
}

export interface Validation { ok: boolean; problems: string[] }
export function validateSummary(pack: EvidencePack, c: SummaryContent): Validation {
  const problems: string[] = [];
  const ok = validRefs(pack);
  const sections = ["participant", "basis", "facility", "supporting", "contradicting", "contradictions", "missing"] as const;
  for (const sec of sections) {
    for (const b of c[sec]) {
      for (const p of assistantTextProblems(b.text)) problems.push(`${sec}/${b.id}: ${p}`);
      for (const r of b.refs) if (!ok.has(`${r.type}:${r.id}`)) problems.push(`${sec}/${b.id}: rujukan tidak dikenal ${r.type}:${r.id}`);
      if (sec !== "missing" && sec !== "basis" && sec !== "facility" && b.refs.length === 0) problems.push(`${sec}/${b.id}: pernyataan tanpa sumber`);
    }
  }
  c.steps.forEach((s, i) => {
    for (const p of assistantTextProblems(s.text + " " + (s.payload.issue ?? ""))) problems.push(`steps/${i}: ${p}`);
    for (const r of s.refs) if (!ok.has(`${r.type}:${r.id}`)) problems.push(`steps/${i}: rujukan tidak dikenal ${r.type}:${r.id}`);
  });
  return { ok: problems.length === 0, problems };
}

/* ---------- Pembuatan dan penyimpanan ---------- */
export interface LiveSummarizer {
  (pack: EvidencePack, cfg: AiConfig): Promise<{ content: SummaryContent; provider: string; model: string | null; usage: { tokens_in?: number; tokens_out?: number; cost_usd?: number }; latency_ms: number }>;
}

export interface GenerateResult { summaryId: string; mode: AiMode; version: number; problems: string[] }

interface Built { mode: AiMode; content: SummaryContent; provider: string; model: string | null; usage: { tokens_in?: number; tokens_out?: number; cost_usd?: number }; latency: number | null; status: "ok" | "invalid" | "timeout" | "error" | "unavailable"; fallbackReason: string | null; problems: string[] }

function rulesBuild(pack: EvidencePack, mode: AiMode, status: Built["status"], fallbackReason: string | null, problems: string[]): Built {
  const content = composeSummary(pack);
  const v = validateSummary(pack, content);
  return { mode, content, provider: RULES_PROVIDER, model: null, usage: {}, latency: null, status, fallbackReason, problems: [...problems, ...v.problems.map((x) => `penyusun aturan: ${x}`)] };
}

function finalize(db: Database.Database, p: Principal, f: FindingRow, cfg: AiConfig, pack: EvidencePack, b: Built): GenerateResult {
  const fp = packFingerprint(pack);
  const invocationId = logInvocation(db, {
    operation: "case_summary", case_id: f.case_id, mode: b.mode, provider: b.provider, model: b.mode === "live" ? b.model : null, prompt_version: SUMMARY_PROMPT_VERSION, schema_version: AI_SCHEMA_VERSION,
    config_version: cfg.version, status: b.status, latency_ms: b.latency, tokens_in: b.usage.tokens_in ?? null, tokens_out: b.usage.tokens_out ?? null, cost_usd: b.usage.cost_usd ?? null,
    request: { finding: f.id, fingerprint: fp, sections: { fakta: pack.facts.length, layanan: pack.services.length, klarifikasi: pack.clarifications.length, tautan: pack.links.length } },
    response: { bagian: Object.fromEntries(Object.entries(b.content).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])) },
    validation: { ok: b.problems.length === 0, problems: b.problems.slice(0, 10) }, fallback_reason: b.fallbackReason,
  });
  const saved = persistSummary(db, p, f, b.content, { mode: b.mode, provider: b.provider, model: b.model, invocationId, fingerprint: fp });
  return { ...saved, mode: b.mode, problems: b.problems };
}

function prepare(db: Database.Database, p: Principal, findingId: string) {
  assertCan(p, "case.work");
  const f = getFinding(db, findingId);
  if (!f) throw new DomainError("Temuan tidak ditemukan.", 404);
  assertCaseAccess(p, f.facility_id);
  return { f, cfg: getActiveConfig(db), pack: buildPack(db, f) };
}

/** Jalur sinkron tanpa model: penyusun aturan, berlabel "Simulasi". Dipakai bila kunci penyedia tidak ada atau konfigurasi meminta simulasi, dan oleh seed. */
export function createSimulatedSummary(db: Database.Database, p: Principal, findingId: string): GenerateResult {
  const { f, cfg, pack } = prepare(db, p, findingId);
  return finalize(db, p, f, cfg, pack, rulesBuild(pack, "simulated", "ok", null, []));
}

export async function generateCaseSummary(db: Database.Database, p: Principal, findingId: string, deps: { live?: LiveSummarizer } = {}): Promise<GenerateResult> {
  const { f, cfg, pack } = prepare(db, p, findingId);
  if (resolveMode(cfg) !== "live" && !deps.live) return finalize(db, p, f, cfg, pack, rulesBuild(pack, "simulated", "ok", null, []));
  try {
    const live = deps.live ?? (await import("./summary-live")).summarizeWithModel;
    const r = await live(pack, cfg);
    const v = validateSummary(pack, r.content);
    if (!v.ok) return finalize(db, p, f, cfg, pack, rulesBuild(pack, "fallback", "invalid", `Keluaran model ditolak validator: ${v.problems.slice(0, 3).join("; ")}`, v.problems));
    return finalize(db, p, f, cfg, pack, { mode: "live", content: r.content, provider: r.provider, model: r.model, usage: r.usage, latency: r.latency_ms, status: "ok", fallbackReason: null, problems: [] });
  } catch (e) {
    const err = e as { code?: string; message?: string; name?: string };
    const status = err.code === "timeout" || /timed? ?out/i.test(err.message ?? "") ? "timeout" : "error";
    return finalize(db, p, f, cfg, pack, rulesBuild(pack, "fallback", status, `Pemanggilan model gagal (${err.name ?? "Error"}).`, []));
  }
}

function persistSummary(db: Database.Database, p: Principal, f: FindingRow, c: SummaryContent, m: { mode: AiMode; provider: string; model: string | null; invocationId: string; fingerprint: string }) {
  return db.transaction(() => {
    const version = ((db.prepare("SELECT MAX(version) v FROM case_summaries WHERE finding_id = ?").get(f.id) as { v: number | null }).v ?? 0) + 1;
    const id = nextId(db, "RS");
    db.prepare("INSERT INTO case_summaries (id, case_id, finding_id, version, mode, provider, model, prompt_version, schema_version, invocation_id, status, content_json, evidence_fingerprint, corrections_json, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,'draft',?,?,'[]',?,?)").run(
      id, f.case_id, f.id, version, m.mode, m.provider, m.model, SUMMARY_PROMPT_VERSION, AI_SCHEMA_VERSION, m.invocationId, JSON.stringify(c), m.fingerprint, p.id, nowPrecise(),
    );
    db.prepare("UPDATE assistant_suggestions SET state = 'superseded' WHERE finding_id = ? AND state = 'proposed'").run(f.id);
    const ins = db.prepare("INSERT INTO assistant_suggestions (id, summary_id, case_id, finding_id, kind, text, payload_json, refs_json, state, created_at) VALUES (?,?,?,?,?,?,?,?,'proposed',?)");
    for (const s of c.steps) ins.run(nextId(db, "SG"), id, f.case_id, f.id, s.kind, s.text, JSON.stringify(s.payload), JSON.stringify(s.refs), nowPrecise());
    appendAudit(db, { actor: p.id, actor_role: p.role, action: "ringkasan_ai_dibuat", entity: "finding", entity_id: f.id, detail: { ringkasan: id, mode: m.mode, versi: version, saran: c.steps.length } });
    return { summaryId: id, version };
  })();
}

export interface SummaryRow {
  id: string; case_id: string; finding_id: string; version: number; mode: AiMode; provider: string | null; model: string | null; prompt_version: string; status: string;
  content: SummaryContent; fingerprint: string; corrections: { block_id: string; text: string; note: string; by: string; at: string }[]; created_by: string; created_at: string;
}
const rowToSummary = (r: Record<string, unknown>): SummaryRow => ({
  id: r.id as string, case_id: r.case_id as string, finding_id: r.finding_id as string, version: r.version as number, mode: r.mode as AiMode, provider: (r.provider as string) ?? null, model: (r.model as string) ?? null,
  prompt_version: r.prompt_version as string, status: r.status as string, content: json<SummaryContent>(r.content_json as string, composeEmpty()), fingerprint: r.evidence_fingerprint as string,
  corrections: json(r.corrections_json as string, []), created_by: r.created_by as string, created_at: r.created_at as string,
});
const composeEmpty = (): SummaryContent => ({ participant: [], basis: [], facility: [], supporting: [], contradicting: [], contradictions: [], missing: [], steps: [], limits: [] });

export function latestSummary(db: Database.Database, findingId: string): SummaryRow | null {
  const r = db.prepare("SELECT * FROM case_summaries WHERE finding_id = ? ORDER BY version DESC LIMIT 1").get(findingId) as Record<string, unknown> | undefined;
  return r ? rowToSummary(r) : null;
}

/** Petugas mengoreksi satu pernyataan pada ringkasan. Teks asli tetap tersimpan; koreksi ditambahkan bersama alasan. */
export function correctSummary(db: Database.Database, p: Principal, summaryId: string, blockId: string, text: string, note: string) {
  assertCan(p, "case.work");
  const t = text.trim();
  if (t.length < 5 || t.length > 600) throw new DomainError("Teks koreksi 5–600 karakter.", 422);
  if (note.trim().length < 5) throw new DomainError("Alasan koreksi wajib diisi.", 422);
  const probs = assistantTextProblems(t);
  if (probs.length) throw new DomainError(`Koreksi ditolak: ${probs.join("; ")}.`, 422);
  db.transaction(() => {
    const r = db.prepare("SELECT * FROM case_summaries WHERE id = ?").get(summaryId) as Record<string, unknown> | undefined;
    if (!r) throw new DomainError("Ringkasan tidak ditemukan.", 404);
    const s = rowToSummary(r);
    const f = getFinding(db, s.finding_id)!;
    assertCaseAccess(p, f.facility_id);
    const all = Object.entries(s.content).flatMap(([, v]) => (Array.isArray(v) ? (v as { id?: string }[]) : [])).map((b) => b.id);
    if (!all.includes(blockId)) throw new DomainError("Pernyataan tidak ditemukan pada ringkasan ini.", 404);
    const corrections = [...s.corrections, { block_id: blockId, text: t, note: note.trim(), by: p.id, at: nowPrecise() }];
    db.prepare("UPDATE case_summaries SET corrections_json = ?, status = 'reviewed' WHERE id = ?").run(JSON.stringify(corrections), summaryId);
    appendAudit(db, { actor: p.id, actor_role: p.role, action: "ringkasan_ai_dikoreksi", entity: "finding", entity_id: s.finding_id, detail: { ringkasan: summaryId, pernyataan: blockId } });
  })();
}

export interface SuggestionRow {
  id: string; summary_id: string; case_id: string; finding_id: string; kind: SuggestionKind; text: string; payload: SuggestionDraft["payload"]; refs: SourceRef[];
  state: "proposed" | "accepted" | "modified" | "dismissed" | "superseded"; final_text: string | null; decision_reason: string | null; decided_by: string | null; decided_at: string | null; created_at: string;
}
export const rowToSuggestion = (r: Record<string, unknown>): SuggestionRow => ({
  id: r.id as string, summary_id: r.summary_id as string, case_id: r.case_id as string, finding_id: r.finding_id as string, kind: r.kind as SuggestionKind, text: r.text as string,
  payload: json(r.payload_json as string, {}), refs: json(r.refs_json as string, []), state: r.state as SuggestionRow["state"], final_text: (r.final_text as string) ?? null,
  decision_reason: (r.decision_reason as string) ?? null, decided_by: (r.decided_by as string) ?? null, decided_at: (r.decided_at as string) ?? null, created_at: r.created_at as string,
});

/** Petugas menerima, mengubah, atau tidak memakai saran. Tidak ada saran yang dieksekusi otomatis: menerima hanya mencatat; tindakan (mis. mengirim klarifikasi) tetap dilakukan petugas. */
export function decideSuggestion(db: Database.Database, p: Principal, suggestionId: string, decision: "accepted" | "modified" | "dismissed", opts: { text?: string; reason?: string } = {}) {
  assertCan(p, "case.work");
  const reason = (opts.reason ?? "").trim();
  if (decision !== "accepted" && reason.length < 5) throw new DomainError("Alasan wajib diisi saat mengubah atau tidak memakai saran (minimal 5 karakter).", 422);
  let finalText: string | null = null;
  if (decision === "modified") {
    finalText = (opts.text ?? "").trim();
    if (finalText.length < 5 || finalText.length > 900) throw new DomainError("Teks perubahan 5–900 karakter.", 422);
    const probs = assistantTextProblems(finalText);
    if (probs.length) throw new DomainError(`Perubahan ditolak: ${probs.join("; ")}.`, 422);
  }
  db.transaction(() => {
    const r = db.prepare("SELECT * FROM assistant_suggestions WHERE id = ?").get(suggestionId) as Record<string, unknown> | undefined;
    if (!r) throw new DomainError("Saran tidak ditemukan.", 404);
    const s = rowToSuggestion(r);
    const f = getFinding(db, s.finding_id)!;
    assertCaseAccess(p, f.facility_id);
    if (s.state !== "proposed") throw new DomainError("Saran ini sudah diputuskan atau digantikan.", 409);
    db.prepare("UPDATE assistant_suggestions SET state = ?, final_text = ?, decision_reason = ?, decided_by = ?, decided_role = ?, decided_at = ? WHERE id = ?").run(decision, finalText, reason || null, p.id, p.role, nowPrecise(), suggestionId);
    appendAudit(db, { actor: p.id, actor_role: p.role, action: "saran_asisten_diputuskan", entity: "finding", entity_id: s.finding_id, detail: { saran: suggestionId, jenis: s.kind, keputusan: decision } });
  })();
}
