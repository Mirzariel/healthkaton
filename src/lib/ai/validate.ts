import { findForbiddenTerms } from "../labels";
import { interviewOutputZ, type InterviewOutput, type InterviewRequest } from "./contract";
import { interpret, isInstructionLike, quoteInAnswer } from "./nlu";

/* Validator keluaran AI. Aturan: keluaran model adalah USUL, bukan fakta. Yang lolos hanya yang:
   - sesuai skema ketat (field tambahan/enum ilegal ditolak),
   - merujuk request/revisi/turn yang sama (revisi usang ditolak),
   - memakai slot dan nilai yang diizinkan server,
   - memiliki kutipan yang benar-benar ada pada jawaban peserta, dan tidak bertentangan dengan penafsir aturan,
   - memilih pertanyaan hanya dari kandidat yang diberikan server. */

export interface AcceptedProposal {
  slot: string;
  value: string;
  source_turn_id: string;
  source_quote: string;
}
export interface RejectedProposal {
  slot: string;
  value: string;
  quote: string;
  reason: string;
}
export interface ValidationReport {
  /** false: keluaran tidak dapat dipakai sama sekali (skema/revisi/permintaan salah). */
  usable: boolean;
  schema_ok: boolean;
  fatal: string | null;
  accepted: AcceptedProposal[];
  rejected: RejectedProposal[];
  next_question_id: string | null;
  next_question_valid: boolean;
  next_issue: string | null;
  reason_code: InterviewOutput["selection_reason_code"] | null;
  needs_human_help: boolean;
  uncertainties: string[];
  phrase_suggestion: string | null;
  phrase_issue: string | null;
}

const empty = (fatal: string, schema_ok = false): ValidationReport => ({
  usable: false, schema_ok, fatal, accepted: [], rejected: [], next_question_id: null, next_question_valid: false, next_issue: null, reason_code: null,
  needs_human_help: false, uncertainties: [], phrase_suggestion: null, phrase_issue: null,
});

export function validateInterviewOutput(req: InterviewRequest, raw: unknown): ValidationReport {
  const parsed = interviewOutputZ.safeParse(raw);
  if (!parsed.success) return empty(`Skema ditolak: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const out = parsed.data;
  if (out.request_id !== req.request_id) return empty("request_id tidak cocok dengan permintaan.", true);
  if (out.session_revision !== req.session_revision) return empty(`Revisi usang: keluaran untuk revisi ${out.session_revision}, sesi pada revisi ${req.session_revision}.`, true);

  const allowed = new Map(req.allowed_slots.map((a) => [a.slot, new Set(a.values)]));
  const accepted: AcceptedProposal[] = [];
  const rejected: RejectedProposal[] = [];
  const seen = new Set<string>();
  for (const p of out.fact_proposals) {
    const rej = (reason: string) => rejected.push({ slot: p.slot, value: p.value, quote: p.source_quote, reason });
    if (!allowed.has(p.slot)) { rej("slot_tidak_diizinkan"); continue; }
    if (!allowed.get(p.slot)!.has(p.value)) { rej("nilai_tidak_sah_untuk_slot"); continue; }
    if (p.source_turn_id !== req.last_turn.turn_id) { rej("sumber_turn_tidak_diotorisasi"); continue; }
    if (!quoteInAnswer(p.source_quote, req.last_turn.answer_text)) { rej("kutipan_tidak_ada_pada_jawaban"); continue; }
    if (isInstructionLike(p.source_quote)) { rej("kutipan_menyerupai_perintah_sistem"); continue; }
    if (seen.has(p.slot)) { rej("slot_ganda"); continue; }
    // dukungan kutipan: bila penafsir aturan membaca kutipan itu untuk slot yang sama dan hasilnya BERLAWANAN, tolak
    const contra = interpret({ last_turn: { ...req.last_turn, answer_text: p.source_quote }, allowed_slots: req.allowed_slots }).items.find((i) => i.slot === p.slot && i.value !== p.value);
    if (contra) { rej(`kutipan_bertentangan_dengan_nilai(${contra.value})`); continue; }
    seen.add(p.slot);
    accepted.push({ slot: p.slot, value: p.value, source_turn_id: p.source_turn_id, source_quote: p.source_quote });
  }

  const cand = new Set(req.candidate_questions.map((c) => c.id));
  let nextValid = true;
  let nextIssue: string | null = null;
  if (out.proposed_next_question_id !== null && !cand.has(out.proposed_next_question_id)) { nextValid = false; nextIssue = "kandidat_ilegal"; }

  let phrase: string | null = null;
  let phraseIssue: string | null = null;
  if (out.question_text_suggestion) {
    const q = out.proposed_next_question_id ? req.candidate_questions.find((c) => c.id === out.proposed_next_question_id) : undefined;
    const check = q ? validatePhrasing(q.text, out.question_text_suggestion) : "tanpa_kandidat_terpilih";
    if (check) phraseIssue = check;
    else phrase = out.question_text_suggestion.trim();
  }

  return {
    usable: true, schema_ok: true, fatal: null, accepted, rejected, next_question_id: nextValid ? out.proposed_next_question_id : null, next_question_valid: nextValid, next_issue: nextIssue,
    reason_code: out.selection_reason_code, needs_human_help: out.needs_human_help, uncertainties: out.uncertainties, phrase_suggestion: phrase, phrase_issue: phraseIssue,
  };
}

const STOP = new Set(["apakah", "yang", "anda", "dengan", "untuk", "dari", "pada", "atau", "dan", "itu", "ini", "sudah", "saat", "oleh"]);
const tokens = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t));

/** Kalimat klarifikasi yang dibentuk AI harus: satu pertanyaan, netral, tidak menambah standar/angka/tautan, dan tetap pada fakta yang sama. */
export function validatePhrasing(original: string, suggestion: string): string | null {
  const s = suggestion.trim();
  if (s.length < 10 || s.length > 240) return "panjang_tidak_wajar";
  if ((s.match(/\?/g) ?? []).length !== 1 || !s.endsWith("?")) return "bukan_satu_pertanyaan";
  if (findForbiddenTerms(s).length) return "istilah_tidak_netral";
  if (/https?:|www\.|<|>|\{|\}|`/.test(s)) return "berisi_tautan_atau_markup";
  if (/\d/.test(s)) return "berisi_angka";
  if (/\b(seharusnya|wajib|harus|melanggar|pelanggaran|dugaan|menipu|diagnosis|dosis)\b/i.test(s)) return "menambah_kewajiban_atau_klaim";
  if (/\b(dan|serta)\b.*\?/.test(s) && /\b(apakah|bagaimana)\b.*\b(apakah|bagaimana)\b/i.test(s)) return "lebih_dari_satu_fakta";
  const a = new Set(tokens(original));
  const b = tokens(s);
  if (!a.size) return null;
  const overlap = b.filter((t) => a.has(t)).length / a.size;
  if (overlap < 0.4) return "menyimpang_dari_pertanyaan_asli";
  return null;
}
