import type Database from "better-sqlite3";
import { sha256 } from "../audit";
import { nowPrecise } from "../clock";
import { json, nextId } from "../db";
import type { AiMode, AiOperation } from "./contract";

export interface AiConfig {
  version: number;
  prompt_version: string;
  mode_pref: "auto" | "simulated" | "live";
  provider: string;
  model: string;
  timeout_ms: number;
  max_retries: number;
  budget_core: number;
  budget_clarif: number;
  budget_latency_ms: number;
  bank_mode: "fixed" | "adaptive_clarify";
  active: number;
  created_by: string | null;
  created_at: string | null;
  note: string | null;
}

export function getActiveConfig(db: Database.Database): AiConfig {
  const r = db.prepare("SELECT * FROM ai_configs WHERE active = 1 ORDER BY version DESC LIMIT 1").get() as AiConfig | undefined;
  if (!r) throw new Error("Konfigurasi AI aktif tidak ditemukan.");
  return r;
}

/** Kunci provider hanya dibaca dari lingkungan server; tidak pernah dikirim ke browser. */
export function liveAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Mode yang akan dipakai: 'live' hanya bila diminta/auto DAN kunci tersedia. Tanpa kunci selalu 'simulated' (berlabel). */
export function resolveMode(cfg: Pick<AiConfig, "mode_pref">): "live" | "simulated" {
  if (cfg.mode_pref === "simulated") return "simulated";
  return liveAvailable() ? "live" : "simulated";
}

export interface InvocationLog {
  operation: AiOperation;
  session_id?: string | null;
  turn_id?: string | null;
  eval_run_id?: string | null;
  sandbox_id?: string | null;
  case_id?: string | null;
  mode: AiMode;
  provider?: string | null;
  model?: string | null;
  prompt_version: string;
  schema_version: string;
  config_version: number;
  started_at?: string;
  latency_ms?: number | null;
  status: "ok" | "invalid" | "timeout" | "error" | "unavailable";
  retries?: number;
  tokens_in?: number | null;
  tokens_out?: number | null;
  cost_usd?: number | null;
  error_code?: string | null;
  reason_code?: string | null;
  request?: unknown;
  response?: unknown;
  validation?: unknown;
  fallback_reason?: string | null;
}

/** Catat satu pemanggilan AI. Metrik (token/biaya) diisi HANYA bila penyedia mengirimnya; selain itu NULL ("tidak tersedia").
    Payload disimpan seperlunya (untuk jejak turn) dan tidak ditulis ke log umum. */
export function logInvocation(db: Database.Database, l: InvocationLog): string {
  const id = nextId(db, "AI", 5);
  db.prepare(
    "INSERT INTO ai_invocations (id, operation, session_id, turn_id, eval_run_id, sandbox_id, case_id, mode, provider, model, prompt_version, schema_version, config_version, started_at, latency_ms, status, retries, tokens_in, tokens_out, cost_usd, error_code, reason_code, request_json, response_json, validation_json, fallback_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    id, l.operation, l.session_id ?? null, l.turn_id ?? null, l.eval_run_id ?? null, l.sandbox_id ?? null, l.case_id ?? null, l.mode, l.provider ?? null, l.model ?? null, l.prompt_version, l.schema_version, l.config_version,
    l.started_at ?? nowPrecise(), l.latency_ms ?? null, l.status, l.retries ?? 0, l.tokens_in ?? null, l.tokens_out ?? null, l.cost_usd ?? null, l.error_code ?? null, l.reason_code ?? null,
    l.request === undefined ? null : JSON.stringify(l.request), l.response === undefined ? null : JSON.stringify(l.response), l.validation === undefined ? null : JSON.stringify(l.validation), l.fallback_reason ?? null,
  );
  return id;
}

export const requestFingerprint = (req: unknown) => sha256(JSON.stringify(req)).slice(0, 12);
