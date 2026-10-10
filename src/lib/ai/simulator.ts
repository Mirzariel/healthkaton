import { AI_SCHEMA_VERSION, type AIProviderAdapter, type InterviewOutput, type InterviewRequest, type ProviderResult, type ReasonCode } from "./contract";
import { interpret } from "./nlu";
import { promptDef } from "./prompts";

/* SIMULATOR AI: penafsir deterministik berbasis aturan yang memenuhi kontrak AI v1 yang sama dengan penyedia langsung.
   Selalu berlabel SIMULASI. Bukan inferensi model bahasa. Dipakai bila kunci penyedia tidak ada, pada seed/tes, dan sebagai baseline. */

export function simulateInterview(req: InterviewRequest, opts: { promptVersion?: string } = {}): InterviewOutput {
  const strict = promptDef(opts.promptVersion ?? "").strict;
  const r = interpret(req, { strict });
  const proposals = r.items.map((i) => ({ slot: i.slot, value: i.value, source_turn_id: req.last_turn.turn_id, source_quote: i.quote, needs_confirmation: true }));
  const filled = new Set(proposals.map((p) => p.slot));
  // jangan menanyakan ulang hal yang sudah dijawab pada kalimat yang sama
  const remaining = req.candidate_questions.filter((c) => !filled.has(c.target_slot));
  const skipped = remaining.length < req.candidate_questions.length;
  const pick = remaining[0] ?? null;
  let reason: ReasonCode = "no_candidate";
  if (r.needsHelp) reason = "needs_human_help";
  else if (pick) {
    reason = pick.id.startsWith("CTX_") ? "resolve_applicability" : /reason/.test(pick.target_slot) ? "clarify_missing_reason" : skipped ? "skip_already_answered" : /^(.*)_(paid|purchase|arranged)$/.test(pick.target_slot) ? "follow_branch" : "next_core";
  }
  return {
    schema_version: AI_SCHEMA_VERSION,
    request_id: req.request_id,
    session_revision: req.session_revision,
    fact_proposals: proposals.slice(0, 8),
    proposed_next_question_id: pick?.id ?? null,
    selection_reason_code: reason,
    uncertainties: r.uncertainties,
    needs_human_help: r.needsHelp,
    question_text_suggestion: null,
  };
}

export const simulatedProvider: AIProviderAdapter = {
  kind: "simulated",
  provider: "simulator",
  async interview(req, opts): Promise<ProviderResult<unknown>> {
    return simulateSync(req, opts.promptVersion);
  },
  async summarizeCase(input, opts): Promise<ProviderResult<unknown>> {
    const { simulateCaseSummary } = await import("./case-summary");
    const t0 = Date.now();
    const output = simulateCaseSummary(input as never);
    void opts;
    return { output, provider: "simulator", model: null, usage: {}, latency_ms: Date.now() - t0 };
  },
  async testConnection() {
    return { ok: true, detail: "Simulator lokal siap. Tidak ada panggilan jaringan; ini BUKAN uji koneksi ke penyedia AI.", latency_ms: 0 };
  },
};

export function simulateSync(req: InterviewRequest, promptVersion: string): ProviderResult<unknown> {
  const t0 = performance.now();
  const output = simulateInterview(req, { promptVersion });
  return { output, provider: "simulator", model: null, usage: {}, latency_ms: Math.max(0, Math.round(performance.now() - t0)) };
}
