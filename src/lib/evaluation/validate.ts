import { interviewOutputZ, type InterviewOutput, type InterviewRequest } from "../ai/contract";
import { interpret, isInstructionLike, quoteInAnswer } from "../ai/nlu";
import { validateInterviewOutput as validateProduction } from "../ai/validate";
import type { Proposal } from "./types";

/* Validator untuk harness evaluasi = validator PRODUKSI (ai/validate.ts), dibungkus agar bentuk hasilnya sesuai kebutuhan metrik evaluasi.
   Tidak ada logika validasi sendiri di sini; hanya (a) pemetaan alasan penolakan ke kosakata taksonomi kegagalan evaluasi dan
   (b) penghitungan 'rawSupported' (usulan yang kutipannya memang didukung jawaban) untuk metrik dukungan kutipan.
   Dua tingkat: keluaran gagal seluruhnya → pemanggil jatuh ke aturan; atau butir ditolak satu per satu dan sisanya dipakai. */

export interface Issue { code: string; detail: string }
export interface Rejected { slot: string; value: string; reason: string }
export type Validated =
  | { ok: true; output: InterviewOutput; proposals: Proposal[]; rejected: Rejected[]; suggestionDropped: boolean; rawCount: number; rawSupported: number }
  | { ok: false; issues: Issue[] };

const REASON: Record<string, string> = {
  slot_tidak_diizinkan: "slot_not_allowed",
  nilai_tidak_sah_untuk_slot: "value_not_allowed",
  sumber_turn_tidak_diotorisasi: "wrong_source_turn",
  kutipan_tidak_ada_pada_jawaban: "unsupported_quote",
  kutipan_menyerupai_perintah_sistem: "instruction_like_quote",
  slot_ganda: "duplicate_slot",
};
const mapReason = (r: string) => (r.startsWith("kutipan_bertentangan_dengan_nilai") ? "quote_conflicts_with_value" : (REASON[r] ?? r));

function fatalCode(fatal: string): string {
  if (fatal.startsWith("Skema")) return "schema";
  if (fatal.startsWith("request_id")) return "request_id_mismatch";
  if (fatal.startsWith("Revisi")) return "revision_mismatch";
  return "invalid";
}

export function validateInterviewOutput(req: InterviewRequest, raw: unknown): Validated {
  const rep = validateProduction(req, raw);
  if (!rep.usable) return { ok: false, issues: [{ code: fatalCode(rep.fatal ?? ""), detail: (rep.fatal ?? "keluaran tidak dapat dipakai").slice(0, 200) }] };
  const out = interviewOutputZ.parse(raw);
  if (!rep.next_question_valid) {
    const again = out.proposed_next_question_id !== null && req.asked_question_ids.includes(out.proposed_next_question_id);
    return { ok: false, issues: [{ code: again ? "repeated_question" : "illegal_next_question", detail: again ? `id ${out.proposed_next_question_id} sudah ditanyakan` : `id ${out.proposed_next_question_id} bukan kandidat yang diizinkan aturan` }] };
  }
  const rawSupported = out.fact_proposals.filter((p) => {
    if (!quoteInAnswer(p.source_quote, req.last_turn.answer_text) || isInstructionLike(p.source_quote)) return false;
    const contra = interpret({ last_turn: { ...req.last_turn, answer_text: p.source_quote }, allowed_slots: req.allowed_slots }).items.find((i) => i.slot === p.slot && i.value !== p.value);
    return !contra;
  }).length;
  return {
    ok: true,
    output: out,
    proposals: rep.accepted.map((a) => ({ slot: a.slot, value: a.value, quote: a.source_quote })),
    rejected: rep.rejected.map((r) => ({ slot: r.slot, value: r.value, reason: mapReason(r.reason) })),
    suggestionDropped: !!out.question_text_suggestion && rep.phrase_issue !== null,
    rawCount: out.fact_proposals.length,
    rawSupported,
  };
}
