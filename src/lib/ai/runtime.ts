import type Database from "better-sqlite3";
import { nowPrecise } from "../clock";
import { nextId } from "../db";
import { AI_SCHEMA_VERSION, ProviderError, interviewRequestZ, type AIProviderAdapter, type AiMode, type AiOperation, type InterviewRequest, type ProviderResult } from "./contract";
import { getActiveConfig, liveAvailable, logInvocation, requestFingerprint, resolveMode, type AiConfig } from "./invocations";
import { anthropicProvider } from "./live";
import { DEFAULT_PROMPT } from "./prompts";
import { simulateInterview, simulateSync, simulatedProvider } from "./simulator";
import { validateInterviewOutput, type ValidationReport } from "./validate";

/* Runtime AI: menyusun permintaan, memanggil penyedia (langsung/simulasi) dengan batas waktu dan pengulangan terbatas,
   memvalidasi keluaran, MENCATAT setiap pemanggilan, dan jatuh ke fallback deterministik bila gagal. Sesi tidak pernah bergantung pada keberhasilan AI. */

export type Fault = "timeout" | "unavailable" | "invalid_json" | "stale_revision" | "illegal_candidate" | "bad_quote";
export const FAULT_LABEL: Record<Fault, string> = {
  timeout: "Waktu tunggu penyedia habis",
  unavailable: "Penyedia tidak tersedia",
  invalid_json: "Keluaran bukan skema yang sah",
  stale_revision: "Keluaran untuk revisi usang",
  illegal_candidate: "Memilih pertanyaan di luar kandidat",
  bad_quote: "Kutipan tidak ada pada jawaban",
};

let liveOverride: AIProviderAdapter | null = null;
/** Hanya untuk tes: ganti penyedia langsung dengan palsu. */
export function __setLiveProviderForTests(p: AIProviderAdapter | null) {
  liveOverride = p;
}
export const liveProvider = (): AIProviderAdapter => liveOverride ?? anthropicProvider;
const liveReady = () => !!liveOverride || liveAvailable();

export interface InterviewInput {
  session_id: string;
  session_revision: number;
  stage: InterviewRequest["stage"];
  indicator_versions: string[];
  episode_context: InterviewRequest["episode_context"];
  confirmed_facts: InterviewRequest["confirmed_facts"];
  asked_question_ids: string[];
  last_turn: InterviewRequest["last_turn"];
  candidate_questions: InterviewRequest["candidate_questions"];
  allowed_slots: InterviewRequest["allowed_slots"];
}

export interface RunContext {
  operation?: AiOperation;
  turn_id?: string | null;
  sandbox_id?: string | null;
  eval_run_id?: string | null;
  cfg?: AiConfig;
  /** Paksa mode (sandbox/eval/seed). 'simulated' tidak pernah memanggil jaringan. */
  forceMode?: "simulated" | "live";
  promptVersion?: string;
  model?: string;
  fault?: Fault | null;
  /** Jangan menulis ke ai_invocations (mis. baseline evaluasi murni). */
  noLog?: boolean;
}

export interface InterviewResult {
  mode: AiMode;
  invocation_id: string | null;
  report: ValidationReport;
  provider: string | null;
  model: string | null;
  latency_ms: number;
  status: "ok" | "invalid" | "timeout" | "error" | "unavailable";
  fallback_reason: string | null;
  retries: number;
  request: InterviewRequest;
  prompt_version: string;
  config_version: number;
}

function newRequest(db: Database.Database, inp: InterviewInput): InterviewRequest {
  return interviewRequestZ.parse({ schema_version: AI_SCHEMA_VERSION, request_id: nextId(db, "REQ", 5), ...inp });
}

function faultyOutput(req: InterviewRequest, fault: Fault, promptVersion: string): unknown {
  const base = simulateInterview(req, { promptVersion });
  switch (fault) {
    case "invalid_json": return { ...base, unexpected_field: "x", selection_reason_code: "kode_ilegal" };
    case "stale_revision": return { ...base, session_revision: req.session_revision - 1 };
    case "illegal_candidate": return { ...base, proposed_next_question_id: "ADMIN_OVERRIDE" };
    case "bad_quote": return { ...base, fact_proposals: [{ slot: req.allowed_slots[0]?.slot ?? "x", value: req.allowed_slots[0]?.values[0] ?? "yes", source_turn_id: req.last_turn.turn_id, source_quote: "kutipan karangan yang tidak ada", needs_confirmation: true }] };
    default: return base;
  }
}

interface Plan {
  req: InterviewRequest;
  cfg: AiConfig;
  mode: "live" | "simulated";
  /** 'unavailable' bila mode_pref=live tetapi kunci tidak ada. */
  blocked: string | null;
  promptVersion: string;
  model: string;
  ctx: RunContext;
}

function plan(db: Database.Database, inp: InterviewInput, ctx: RunContext): Plan {
  const cfg = ctx.cfg ?? getActiveConfig(db);
  const req = newRequest(db, inp);
  // 'live' bila diminta/auto DAN penyedia siap (kunci server, atau penyedia pengganti pada tes); selain itu simulasi berlabel.
  let mode: "live" | "simulated" = ctx.forceMode ?? (cfg.mode_pref === "simulated" ? "simulated" : liveReady() ? "live" : resolveMode(cfg));
  let blocked: string | null = null;
  if (ctx.forceMode === undefined && cfg.mode_pref === "live" && !liveReady()) { mode = "simulated"; blocked = "Mode 'langsung' dipilih tetapi kunci penyedia tidak ada di server."; }
  if (ctx.forceMode === "live" && !liveReady()) { mode = "simulated"; blocked = "Mode 'langsung' diminta tetapi kunci penyedia tidak ada di server."; }
  if (mode === "live" && !liveReady()) { mode = "simulated"; }
  return { req, cfg, mode, blocked, promptVersion: ctx.promptVersion ?? cfg.prompt_version ?? DEFAULT_PROMPT, model: ctx.model ?? cfg.model, ctx };
}

const retryDelay = (n: number) => new Promise((r) => setTimeout(r, Math.min(1500, 250 * 2 ** n)));

/** Panggil penyedia dengan batas waktu dan pengulangan terbatas. Mengembalikan hasil atau galat terstruktur. */
async function callProvider(p: Plan): Promise<{ res?: ProviderResult<unknown>; err?: ProviderError; retries: number }> {
  const { ctx, cfg } = p;
  const provider = p.mode === "live" ? liveProvider() : simulatedProvider;
  const started = Date.now();
  let retries = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      if (ctx.fault === "timeout") throw new ProviderError("Waktu tunggu penyedia habis (disimulasikan).", "timeout", false);
      if (ctx.fault === "unavailable") throw new ProviderError("Penyedia tidak tersedia (disimulasikan).", "unavailable", false);
      const call = provider.interview(p.req, { timeoutMs: cfg.timeout_ms, model: p.model, promptVersion: p.promptVersion });
      const res = await Promise.race([
        call,
        new Promise<never>((_, rej) => setTimeout(() => rej(new ProviderError("Waktu tunggu penyedia habis.", "timeout", true)), cfg.timeout_ms + 500)),
      ]);
      if (ctx.fault) return { res: { ...res, output: faultyOutput(p.req, ctx.fault, p.promptVersion) }, retries };
      return { res, retries };
    } catch (e) {
      const err = e instanceof ProviderError ? e : new ProviderError(e instanceof Error ? e.message.slice(0, 200) : "Galat tidak dikenal.", "error", false);
      const budgetLeft = cfg.budget_latency_ms - (Date.now() - started);
      if (err.retryable && retries < cfg.max_retries && budgetLeft > 800) {
        await retryDelay(retries);
        retries++;
        continue;
      }
      return { err, retries };
    }
  }
}

/** Penutup bersama: validasi, fallback, pencatatan. Sinkron. */
function conclude(db: Database.Database, p: Plan, out: { res?: ProviderResult<unknown>; err?: ProviderError; retries: number }): InterviewResult {
  const { req, cfg, ctx } = p;
  let report: ValidationReport | null = null;
  let status: InterviewResult["status"] = "ok";
  let mode: AiMode = p.mode;
  let fallbackReason: string | null = p.blocked;
  let response: unknown = out.res?.output;
  let providerName: string | null = out.res?.provider ?? (p.mode === "live" ? liveProvider().provider : "simulator");
  let model: string | null = out.res?.model ?? null;
  let latency = out.res?.latency_ms ?? 0;
  let errorCode: string | null = null;

  if (out.err) {
    status = out.err.code === "timeout" ? "timeout" : out.err.code === "unavailable" ? "unavailable" : out.err.code === "invalid" ? "invalid" : "error";
    errorCode = out.err.code;
    fallbackReason = out.err.message;
  } else if (out.res) {
    report = validateInterviewOutput(req, out.res.output);
    if (!report.usable) { status = "invalid"; errorCode = "invalid_output"; fallbackReason = report.fatal; }
  }
  if (!report || !report.usable) {
    // fallback deterministik: penafsir aturan yang sama dengan baseline; sesi tetap berjalan
    const fb = simulateSync(req, p.promptVersion);
    response = { provider_output: out.res?.output ?? null, fallback_output: fb.output };
    report = validateInterviewOutput(req, fb.output);
    mode = "fallback";
    providerName = p.blocked ? "simulator" : (p.mode === "live" ? liveProvider().provider : "simulator");
    if (!out.res) latency = fb.latency_ms;
    if (p.blocked && !out.err) status = "unavailable";
  }
  if (p.mode === "simulated" && !out.err && mode === "simulated" && p.blocked) mode = "fallback";

  const tokens = out.res?.usage ?? {};
  let invId: string | null = null;
  if (!ctx.noLog) {
    invId = logInvocation(db, {
      operation: ctx.operation ?? "interview_turn",
      session_id: req.session_id,
      turn_id: ctx.turn_id ?? req.last_turn.turn_id,
      sandbox_id: ctx.sandbox_id ?? null,
      eval_run_id: ctx.eval_run_id ?? null,
      mode,
      provider: providerName,
      model,
      prompt_version: p.promptVersion,
      schema_version: AI_SCHEMA_VERSION,
      config_version: cfg.version,
      started_at: nowPrecise(),
      latency_ms: latency,
      status,
      retries: out.retries,
      tokens_in: tokens.tokens_in ?? null,
      tokens_out: tokens.tokens_out ?? null,
      cost_usd: tokens.cost_usd ?? null,
      error_code: errorCode,
      reason_code: report.reason_code,
      request: { ...req, _fingerprint: requestFingerprint(req) },
      response,
      validation: { schema_ok: report.schema_ok, fatal: report.fatal, accepted: report.accepted.length, rejected: report.rejected, next_valid: report.next_question_valid, next_issue: report.next_issue, phrase_issue: report.phrase_issue, needs_human_help: report.needs_human_help },
      fallback_reason: mode === "fallback" ? fallbackReason : null,
    });
  }
  return { mode, invocation_id: invId, report, provider: providerName, model, latency_ms: latency, status, fallback_reason: mode === "fallback" ? fallbackReason : null, retries: out.retries, request: req, prompt_version: p.promptVersion, config_version: cfg.version };
}

/** Versi asinkron: boleh memanggil penyedia langsung. */
export async function runInterview(db: Database.Database, inp: InterviewInput, ctx: RunContext = {}): Promise<InterviewResult> {
  const p = plan(db, inp, ctx);
  if (p.mode === "simulated" && !ctx.fault) return conclude(db, p, { res: simulateSync(p.req, p.promptVersion), retries: 0 });
  return conclude(db, p, await callProvider(p));
}

/** Versi sinkron: TIDAK pernah memanggil jaringan (simulasi/fallback saja). Dipakai seed dan tes deterministik. */
export function runInterviewSimulated(db: Database.Database, inp: InterviewInput, ctx: RunContext = {}): InterviewResult {
  const p = plan(db, inp, { ...ctx, forceMode: "simulated" });
  if (ctx.fault) {
    const err = ctx.fault === "timeout" ? new ProviderError("Waktu tunggu penyedia habis (disimulasikan).", "timeout") : ctx.fault === "unavailable" ? new ProviderError("Penyedia tidak tersedia (disimulasikan).", "unavailable") : null;
    if (err) return conclude(db, p, { err, retries: 0 });
    return conclude(db, p, { res: { ...simulateSync(p.req, p.promptVersion), output: faultyOutput(p.req, ctx.fault, p.promptVersion) }, retries: 0 });
  }
  return conclude(db, p, { res: simulateSync(p.req, p.promptVersion), retries: 0 });
}

/** Baseline aturan murni (tanpa catatan, tanpa jaringan): dipakai evaluasi. */
export function baselineInterview(req: InterviewRequest, promptVersion = DEFAULT_PROMPT) {
  return simulateInterview(req, { promptVersion });
}

export async function testConnection(db: Database.Database, cfg: AiConfig, actor: string): Promise<{ ok: boolean; mode: AiMode; detail: string; latency_ms: number }> {
  void actor;
  const mode = resolveMode(cfg);
  let r: { ok: boolean; detail: string; latency_ms: number };
  let used: AiMode = mode;
  if (mode === "live") {
    r = await liveProvider().testConnection({ timeoutMs: cfg.timeout_ms, model: cfg.model });
    if (!r.ok) used = "fallback";
  } else {
    r = await simulatedProvider.testConnection({ timeoutMs: cfg.timeout_ms });
    if (cfg.mode_pref === "live") { r = { ok: false, detail: "Mode 'langsung' dipilih tetapi ANTHROPIC_API_KEY tidak ada di server. Yang berjalan: simulator.", latency_ms: 0 }; used = "fallback"; }
  }
  logInvocation(db, {
    operation: "connection_test", mode: used, provider: mode === "live" ? liveProvider().provider : "simulator", model: mode === "live" ? cfg.model : null, prompt_version: "-", schema_version: AI_SCHEMA_VERSION, config_version: cfg.version,
    latency_ms: r.latency_ms, status: r.ok ? "ok" : mode === "live" ? "error" : "unavailable", error_code: r.ok ? null : "connection_test_failed", fallback_reason: r.ok ? null : r.detail,
  });
  return { ok: r.ok, mode: used, detail: r.detail, latency_ms: r.latency_ms };
}
