import { interviewOutputZ, type InterviewOutput, type InterviewRequest } from "../ai/contract";
import { findForbiddenTerms } from "../labels";
import { quoteConflicts } from "./lexicon";
import type { Proposal } from "./types";

/* Validator keluaran AI untuk harness evaluasi. Dua tingkat:
   - gagal seluruhnya (skema, id permintaan, revisi, id pertanyaan di luar kandidat) → pemanggil jatuh ke aturan (fallback);
   - gagal per butir (slot/nilai tidak diizinkan, kutipan bukan potongan jawaban, kutipan bertentangan) → butir ditolak, sisanya tetap dipakai.
   Ini replika langkah validasi produksi untuk keperluan evaluasi; ketika survei-ai mengirim validator produksi, selisihnya dicatat di dokumen modul. */

export interface Issue { code: string; detail: string }
export interface Rejected { slot: string; value: string; reason: string }
export type Validated =
  | { ok: true; output: InterviewOutput; proposals: Proposal[]; rejected: Rejected[]; suggestionDropped: boolean; rawCount: number; rawSupported: number }
  | { ok: false; issues: Issue[] };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function validateInterviewOutput(req: InterviewRequest, raw: unknown): Validated {
  const parsed = interviewOutputZ.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.slice(0, 5).map((i) => ({ code: "schema", detail: `${i.path.join(".") || "(akar)"}: ${i.message}` })) };
  }
  const out = parsed.data;
  const issues: Issue[] = [];
  if (out.request_id !== req.request_id) issues.push({ code: "request_id_mismatch", detail: "request_id tidak sama dengan permintaan" });
  if (out.session_revision !== req.session_revision) issues.push({ code: "revision_mismatch", detail: "session_revision tidak sama dengan permintaan" });
  const candidateIds = new Set(req.candidate_questions.map((c) => c.id));
  if (out.proposed_next_question_id !== null && !candidateIds.has(out.proposed_next_question_id)) {
    const again = req.asked_question_ids.includes(out.proposed_next_question_id);
    issues.push({ code: again ? "repeated_question" : "illegal_next_question", detail: again ? `id ${out.proposed_next_question_id} sudah ditanyakan` : `id ${out.proposed_next_question_id} bukan kandidat yang diizinkan aturan` });
  }
  if (issues.length) return { ok: false, issues };

  const answer = norm(req.last_turn.answer_text);
  const allowed = new Map(req.allowed_slots.map((a) => [a.slot, a.values]));
  const accepted: Proposal[] = [];
  const rejected: Rejected[] = [];
  const seen = new Set<string>();
  let rawSupported = 0;
  for (const p of out.fact_proposals) {
    const rej = (reason: string) => rejected.push({ slot: p.slot, value: p.value, reason });
    const quoteOk = norm(p.source_quote).length > 0 && answer.includes(norm(p.source_quote));
    if (quoteOk && !quoteConflicts(p.slot, p.value, p.source_quote)) rawSupported++;
    const vals = allowed.get(p.slot);
    if (!vals) { rej("slot_not_allowed"); continue; }
    if (!vals.includes(p.value)) { rej("value_not_allowed"); continue; }
    if (p.source_turn_id !== req.last_turn.turn_id) { rej("wrong_source_turn"); continue; }
    if (!quoteOk) { rej("unsupported_quote"); continue; }
    if (quoteConflicts(p.slot, p.value, p.source_quote)) { rej("quote_conflicts_with_value"); continue; }
    if (seen.has(p.slot)) { rej("duplicate_slot"); continue; }
    seen.add(p.slot);
    accepted.push({ slot: p.slot, value: p.value, quote: p.source_quote });
  }
  let suggestionDropped = false;
  if (out.question_text_suggestion && findForbiddenTerms(out.question_text_suggestion).length) {
    suggestionDropped = true;
  }
  return { ok: true, output: out, proposals: accepted, rejected, suggestionDropped, rawCount: out.fact_proposals.length, rawSupported };
}
