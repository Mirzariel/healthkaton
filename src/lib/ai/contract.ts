import { z } from "zod";
import type { Stage } from "../labels";

/* KONTRAK AI v1 (master prompt §8.4). Request disusun backend, bukan dipercaya dari browser.
   Respons ditolak bila ada field tambahan/enum ilegal. Metadata provider/model/latensi/biaya ditambahkan runtime dari data nyata,
   TIDAK dikarang model. Satu-satunya perluasan dari contoh master prompt: `question_text_suggestion` (opsional, tervalidasi). */

export const AI_SCHEMA_VERSION = "1.0" as const;

export const REASON_CODES = [
  "next_core",
  "follow_branch",
  "clarify_missing_reason",
  "resolve_applicability",
  "skip_already_answered",
  "no_candidate",
  "needs_human_help",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const interviewRequestZ = z.strictObject({
  schema_version: z.literal(AI_SCHEMA_VERSION),
  request_id: z.string().min(1),
  session_id: z.string().min(1),
  session_revision: z.number().int().min(0),
  stage: z.enum(["pre", "intra", "post", "directed"]),
  indicator_versions: z.array(z.string()),
  episode_context: z.record(z.string(), z.union([z.string(), z.boolean(), z.number(), z.null()])),
  confirmed_facts: z.array(z.strictObject({ slot: z.string(), value: z.string(), subject: z.string().nullable().optional() })),
  asked_question_ids: z.array(z.string()),
  last_turn: z.strictObject({ turn_id: z.string(), question_id: z.string(), question_text: z.string(), answer_text: z.string() }),
  candidate_questions: z.array(z.strictObject({ id: z.string(), target_slot: z.string(), text: z.string() })),
  /** Slot yang boleh diusulkan beserta nilai sahnya (server menentukan; model tidak boleh menambah). */
  allowed_slots: z.array(z.strictObject({ slot: z.string(), values: z.array(z.string()) })),
});
export type InterviewRequest = z.infer<typeof interviewRequestZ>;

export const factProposalZ = z.strictObject({
  slot: z.string().min(1),
  value: z.string().min(1),
  source_turn_id: z.string().min(1),
  source_quote: z.string().min(1).max(400),
  needs_confirmation: z.boolean(),
});
export const interviewOutputZ = z.strictObject({
  schema_version: z.literal(AI_SCHEMA_VERSION),
  request_id: z.string().min(1),
  session_revision: z.number().int().min(0),
  fact_proposals: z.array(factProposalZ).max(8),
  proposed_next_question_id: z.string().nullable(),
  selection_reason_code: z.enum(REASON_CODES),
  uncertainties: z.array(z.string().max(120)).max(8),
  needs_human_help: z.boolean(),
  question_text_suggestion: z.string().max(240).nullable().optional(),
});
export type InterviewOutput = z.infer<typeof interviewOutputZ>;

export type AiMode = "live" | "simulated" | "fallback";
export type AiOperation = "interview_turn" | "phrase_clarification" | "case_summary" | "extraction_review" | "connection_test" | "eval_case" | "sandbox";

export interface ProviderUsage {
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
}
export interface ProviderResult<T = unknown> {
  /** Keluaran mentah; WAJIB melewati validator sebelum dipakai. */
  output: T;
  provider: string;
  model: string | null;
  usage: ProviderUsage;
  latency_ms: number;
}
export class ProviderError extends Error {
  constructor(message: string, public code: "timeout" | "unavailable" | "error" | "invalid", public retryable = false) {
    super(message);
  }
}

/** Antarmuka penyedia AI. Implementasi: simulator deterministik (kind 'simulated') dan Anthropic (kind 'live'). */
export interface AIProviderAdapter {
  readonly kind: "live" | "simulated";
  readonly provider: string;
  interview(req: InterviewRequest, opts: { timeoutMs: number; model?: string; promptVersion: string }): Promise<ProviderResult<unknown>>;
  /** Draf ringkasan bukti kasus. Keluaran divalidasi (kutipan wajib berasal dari sumber yang diberikan). */
  summarizeCase?(input: unknown, opts: { timeoutMs: number; model?: string; promptVersion: string }): Promise<ProviderResult<unknown>>;
  testConnection(opts: { timeoutMs: number; model?: string }): Promise<{ ok: boolean; detail: string; latency_ms: number }>;
}

export type { Stage };
