import type Database from "better-sqlite3";
import { z } from "zod";
import { appendAudit } from "../audit";
import { assertCan, type Principal } from "../auth/principal";
import { nowPrecise } from "../clock";
import { json, nextId } from "../db";
import { DomainError } from "../idem";
import { listSources, listStandardVersions, loadBank } from "../standards/registry";
import { PROBE_INDICATOR, scopeMatches } from "../survey/engine";
import { composeInterviewInput, factKey } from "../survey/service";
import type { RuleContext } from "../standards/applicability";
import { SESSION_LABEL, STAGE_LABEL, type Stage } from "../labels";
import { getActiveConfig, type AiConfig } from "./invocations";
import { PROMPTS } from "./prompts";
import { runInterview, testConnection, type Fault, type InterviewResult } from "./runtime";
import { liveAvailable } from "./invocations";
import { DEFAULT_MODEL, PRICE_PER_MTOK, PRICE_TABLE_DATE } from "./live";

/* Sisi operasional dasbor AI: riwayat sesi, jejak turn, statistik model, konfigurasi berversi, sumber standar, dan sandbox.
   Peserta ditampilkan sebagai pseudonim. Payload mentah (jawaban peserta) hanya untuk peran dengan ai.view dan tidak ditulis ke log umum. */

/* ---------- Riwayat sesi ---------- */
export interface SessionListRow {
  id: string; stage: Stage; stage_label: string; mode: string; status: string; status_label: string; revision: number; pseudonym: string; facility_name: string; respondent_role: string;
  ai_mode_last: string | null; started_at: string | null; ended_at: string | null; end_reason: string | null; uses_draft: boolean; turns: number; proposals: number; rejected: number; corrections: number;
  fallbacks: number; is_sandbox: boolean;
}
export function listSessions(db: Database.Database, p: Principal, f: { status?: string; stage?: string; ai_mode?: string; limit?: number; offset?: number } = {}) {
  assertCan(p, "ai.view");
  const where: string[] = ["s.is_sandbox = 0"];
  const args: unknown[] = [];
  if (f.status) { where.push("s.status = ?"); args.push(f.status); }
  if (f.stage) { where.push("s.stage = ?"); args.push(f.stage); }
  if (f.ai_mode) { where.push("s.ai_mode_last = ?"); args.push(f.ai_mode); }
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const rows = db.prepare(
    `SELECT s.*, pa.pseudonym, fa.name AS facility_name,
      (SELECT COUNT(*) FROM survey_turns t WHERE t.session_id = s.id) AS turns,
      (SELECT COUNT(*) FROM fact_proposals x WHERE x.session_id = s.id AND x.validation = 'accepted') AS proposals,
      (SELECT COUNT(*) FROM fact_proposals x WHERE x.session_id = s.id AND x.validation = 'rejected') AS rejected,
      (SELECT COUNT(*) FROM participant_facts x WHERE x.session_id = s.id AND x.origin = 'correction') AS corrections,
      (SELECT COUNT(*) FROM ai_invocations i WHERE i.session_id = s.id AND i.mode = 'fallback') AS fallbacks
     FROM survey_sessions s JOIN participants pa ON pa.id = s.participant_id JOIN facilities fa ON fa.id = s.facility_id
     WHERE ${where.join(" AND ")} ORDER BY COALESCE(s.started_at, '') DESC, s.id DESC LIMIT ? OFFSET ?`,
  ).all(...args, limit, f.offset ?? 0) as (Record<string, unknown> & { id: string; stage: Stage; status: keyof typeof SESSION_LABEL; uses_draft: number; is_sandbox: number })[];
  const total = (db.prepare(`SELECT COUNT(*) n FROM survey_sessions s WHERE ${where.join(" AND ")}`).get(...args) as { n: number }).n;
  return {
    total,
    rows: rows.map((r) => ({ ...r, stage_label: STAGE_LABEL[r.stage], status_label: SESSION_LABEL[r.status], uses_draft: !!r.uses_draft, is_sandbox: !!r.is_sandbox })) as unknown as SessionListRow[],
  };
}

/* ---------- Jejak turn ---------- */
export interface InvocationSummary {
  id: string; operation: string; turn_id: string | null; session_id: string | null; mode: string; provider: string | null; model: string | null; prompt_version: string; config_version: number | null; latency_ms: number | null; status: string; retries: number;
  tokens_in: number | null; tokens_out: number | null; cost_usd: number | null; error_code: string | null; reason_code: string | null; fallback_reason: string | null; started_at: string;
  validation: { schema_ok?: boolean; fatal?: string | null; accepted?: number; rejected?: { slot: string; value: string; quote: string; reason: string }[]; next_valid?: boolean; next_issue?: string | null; phrase_issue?: string | null } | null;
}
const invSummary = (r: Record<string, unknown>): InvocationSummary => ({
  id: r.id as string, operation: r.operation as string, turn_id: (r.turn_id as string) ?? null, session_id: (r.session_id as string) ?? null, mode: r.mode as string, provider: (r.provider as string) ?? null, model: (r.model as string) ?? null, prompt_version: r.prompt_version as string,
  config_version: (r.config_version as number) ?? null, latency_ms: (r.latency_ms as number) ?? null, status: r.status as string, retries: r.retries as number, tokens_in: (r.tokens_in as number) ?? null,
  tokens_out: (r.tokens_out as number) ?? null, cost_usd: (r.cost_usd as number) ?? null, error_code: (r.error_code as string) ?? null, reason_code: (r.reason_code as string) ?? null,
  fallback_reason: (r.fallback_reason as string) ?? null, started_at: r.started_at as string, validation: json(r.validation_json as string, null),
});

export function sessionTrace(db: Database.Database, p: Principal, sessionId: string) {
  assertCan(p, "ai.view");
  const s = db.prepare("SELECT s.*, pa.pseudonym, fa.name AS facility_name FROM survey_sessions s JOIN participants pa ON pa.id = s.participant_id JOIN facilities fa ON fa.id = s.facility_id WHERE s.id = ?").get(sessionId) as (Record<string, unknown> & { id: string; indicator_versions_json: string }) | undefined;
  if (!s) throw new DomainError("Sesi tidak ditemukan.", 404);
  const turns = db.prepare("SELECT * FROM survey_turns WHERE session_id = ? ORDER BY seq").all(sessionId) as Record<string, unknown>[];
  const invs = (db.prepare("SELECT * FROM ai_invocations WHERE session_id = ? ORDER BY started_at, id").all(sessionId) as Record<string, unknown>[]).map(invSummary);
  const props = db.prepare("SELECT * FROM fact_proposals WHERE session_id = ? ORDER BY created_at, id").all(sessionId) as Record<string, unknown>[];
  const facts = db.prepare("SELECT * FROM participant_facts WHERE session_id = ? ORDER BY created_at, id").all(sessionId) as Record<string, unknown>[];
  const findings = db.prepare("SELECT id, type, source, title, proof_status, score, case_id FROM findings WHERE dedupe_key LIKE ?").all(`T4:${sessionId}:%`) as Record<string, unknown>[];
  const helps = db.prepare("SELECT id, reason, status, channel, created_at FROM help_requests WHERE session_id = ?").all(sessionId) as Record<string, unknown>[];
  const audit = db.prepare("SELECT id, ts, actor, action, detail FROM audit_log WHERE entity_id = ? OR detail LIKE ? ORDER BY id").all(sessionId, `%${sessionId}%`) as Record<string, unknown>[];
  const idxInv = new Map(invs.map((i) => [i.id, i]));
  return {
    session: { ...s, indicator_versions: json<string[]>(s.indicator_versions_json, []) },
    turns: turns.map((t) => ({
      ...t,
      selected_invocation: t.invocation_id ? idxInv.get(t.invocation_id as string) ?? null : null,
      processed_by: invs.filter((i) => i.operation === "interview_turn" && i.turn_id === t.id),
      proposals: props.filter((x) => x.turn_id === t.id),
    })),
    invocations: invs,
    proposals: props,
    facts,
    findings,
    helps,
    audit: audit.map((a) => ({ id: a.id, ts: a.ts, actor: a.actor, action: a.action })),
  };
}

export function invocationDetail(db: Database.Database, p: Principal, id: string) {
  assertCan(p, "ai.view");
  const r = db.prepare("SELECT * FROM ai_invocations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!r) throw new DomainError("Pemanggilan tidak ditemukan.", 404);
  return { ...invSummary(r), request: json(r.request_json as string, null), response: json(r.response_json as string, null) };
}

/* ---------- Operasional model ---------- */
const pctl = (xs: number[], q: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] : null);
export function modelStats(db: Database.Database, p: Principal) {
  assertCan(p, "ai.view");
  const rows = db.prepare("SELECT mode, status, latency_ms, tokens_in, tokens_out, cost_usd, prompt_version, model, validation_json, error_code, fallback_reason, operation, started_at FROM ai_invocations WHERE sandbox_id IS NULL AND eval_run_id IS NULL").all() as {
    mode: string; status: string; latency_ms: number | null; tokens_in: number | null; tokens_out: number | null; cost_usd: number | null; prompt_version: string; model: string | null; validation_json: string | null; error_code: string | null;
    fallback_reason: string | null; operation: string; started_at: string;
  }[];
  const turn = rows.filter((r) => r.operation === "interview_turn");
  const by = <K extends string>(xs: typeof rows, key: (r: (typeof rows)[number]) => K) => xs.reduce<Record<string, number>>((m, r) => ((m[key(r)] = (m[key(r)] ?? 0) + 1), m), {});
  const live = turn.filter((r) => r.mode === "live" && r.latency_ms !== null).map((r) => r.latency_ms!);
  const rejects: Record<string, number> = {};
  let accepted = 0;
  let rejectedN = 0;
  for (const r of turn) {
    const v = json<{ accepted?: number; rejected?: { reason: string }[] } | null>(r.validation_json, null);
    accepted += v?.accepted ?? 0;
    for (const x of v?.rejected ?? []) { rejectedN++; const k = x.reason.replace(/\(.*\)$/, ""); rejects[k] = (rejects[k] ?? 0) + 1; }
  }
  const withTokens = turn.filter((r) => r.tokens_in !== null);
  const props = db.prepare("SELECT state, validation, origin, COUNT(*) n FROM fact_proposals GROUP BY state, validation, origin").all() as { state: string; validation: string; origin: string; n: number }[];
  const cnt = (f: (x: (typeof props)[number]) => boolean) => props.filter(f).reduce((a, x) => a + x.n, 0);
  const proposedTotal = cnt((x) => x.validation === "accepted");
  const versions = [...new Set(turn.map((r) => r.prompt_version))].map((v) => {
    const xs = turn.filter((r) => r.prompt_version === v);
    return { prompt_version: v, calls: xs.length, fallback: xs.filter((r) => r.mode === "fallback").length, live: xs.filter((r) => r.mode === "live").length };
  });
  const sessions = db.prepare("SELECT status, COUNT(*) n FROM survey_sessions WHERE is_sandbox = 0 GROUP BY status").all() as { status: string; n: number }[];
  return {
    live_available: liveAvailable(),
    total_calls: turn.length,
    other_operations: by(rows.filter((r) => r.operation !== "interview_turn"), (r) => r.operation),
    by_mode: by(turn, (r) => r.mode),
    by_status: by(turn, (r) => r.status),
    fallback_rate: turn.length ? turn.filter((r) => r.mode === "fallback").length / turn.length : null,
    fallback_reasons: by(turn.filter((r) => r.mode === "fallback"), (r) => (r.error_code ?? "ditolak_validator")),
    latency_live: { n: live.length, p50: pctl(live, 0.5), p95: pctl(live, 0.95) },
    tokens: { calls_with_usage: withTokens.length, tokens_in: withTokens.reduce((a, r) => a + (r.tokens_in ?? 0), 0), tokens_out: withTokens.reduce((a, r) => a + (r.tokens_out ?? 0), 0), cost_usd: withTokens.length ? withTokens.reduce((a, r) => a + (r.cost_usd ?? 0), 0) : null, unavailable: turn.length - withTokens.length },
    price_table: { date: PRICE_TABLE_DATE, models: PRICE_PER_MTOK, note: "Biaya adalah ESTIMASI dari tabel harga lokal dan jumlah token yang dilaporkan penyedia; bukan tagihan." },
    validator: { accepted, rejected: rejectedN, rejects },
    proposals: { proposed: proposedTotal, confirmed: cnt((x) => x.validation === "accepted" && x.state === "confirmed"), corrected: cnt((x) => x.validation === "accepted" && x.state === "corrected"), dismissed: cnt((x) => x.validation === "accepted" && x.state === "dismissed"), pending: cnt((x) => x.validation === "accepted" && x.state === "proposed") },
    versions,
    sessions: Object.fromEntries(sessions.map((s) => [s.status, s.n])),
    models: [...new Set(rows.map((r) => r.model).filter(Boolean))],
  };
}

/* ---------- Konfigurasi berversi ---------- */
export const configInputZ = z.strictObject({
  prompt_version: z.string().refine((v) => v in PROMPTS, "Versi prompt tidak dikenal."),
  mode_pref: z.enum(["auto", "simulated", "live"]),
  model: z.string().min(3).max(80).regex(/^[A-Za-z0-9._:-]+$/, "Nama model hanya huruf, angka, titik, titik dua, strip."),
  timeout_ms: z.number().int().min(1000).max(30000),
  max_retries: z.number().int().min(0).max(3),
  budget_core: z.number().int().min(1).max(10),
  budget_clarif: z.number().int().min(0).max(6),
  budget_latency_ms: z.number().int().min(2000).max(60000),
  bank_mode: z.enum(["fixed", "adaptive_clarify"]),
  note: z.string().min(5).max(300),
});
export type ConfigInput = z.infer<typeof configInputZ>;

export function listConfigs(db: Database.Database, p: Principal) {
  assertCan(p, "ai.view");
  return {
    configs: db.prepare("SELECT * FROM ai_configs ORDER BY version DESC").all() as AiConfig[],
    prompts: Object.values(PROMPTS).map((d) => ({ version: d.version, title: d.title, note: d.note, strict: d.strict })),
    live_available: liveAvailable(),
    default_model: DEFAULT_MODEL,
    key_hint: liveAvailable() ? "Kunci penyedia terdeteksi di server (nilainya tidak pernah ditampilkan)." : "Kunci penyedia tidak ada di server. Mode 'auto' dan 'langsung' akan berjalan sebagai simulasi/fallback berlabel.",
  };
}

/** Konfigurasi baru selalu membuat VERSI baru (versi lama tetap utuh untuk telusur). Hanya sesi yang dimulai sesudahnya memakai anggaran baru. */
export function saveConfig(db: Database.Database, p: Principal, raw: unknown) {
  assertCan(p, "ai.config");
  const c = configInputZ.parse(raw);
  return db.transaction(() => {
    const prev = getActiveConfig(db);
    db.prepare("UPDATE ai_configs SET active = 0 WHERE active = 1").run();
    const r = db.prepare("INSERT INTO ai_configs (prompt_version, mode_pref, provider, model, timeout_ms, max_retries, budget_core, budget_clarif, budget_latency_ms, bank_mode, active, created_by, created_at, note) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?)").run(
      c.prompt_version, c.mode_pref, "anthropic", c.model, c.timeout_ms, c.max_retries, c.budget_core, c.budget_clarif, c.budget_latency_ms, c.bank_mode, p.id, nowPrecise(), c.note,
    );
    const version = Number(r.lastInsertRowid);
    const diff: Record<string, [unknown, unknown]> = {};
    for (const k of Object.keys(c) as (keyof ConfigInput)[]) if (k !== "note" && (prev as unknown as Record<string, unknown>)[k] !== c[k]) diff[k] = [(prev as unknown as Record<string, unknown>)[k], c[k]];
    appendAudit(db, { actor: p.id, actor_role: p.role, action: "konfigurasi_ai_disimpan", entity: "ai_config", entity_id: String(version), detail: { dari_versi: prev.version, perubahan: diff } });
    return version;
  })();
}

export function activateConfig(db: Database.Database, p: Principal, version: number, note: string) {
  assertCan(p, "ai.config");
  if (note.trim().length < 5) throw new DomainError("Alasan pengaktifan wajib diisi.", 422);
  db.transaction(() => {
    const c = db.prepare("SELECT version FROM ai_configs WHERE version = ?").get(version);
    if (!c) throw new DomainError("Versi konfigurasi tidak ditemukan.", 404);
    const prev = getActiveConfig(db);
    if (prev.version === version) return;
    db.prepare("UPDATE ai_configs SET active = 0 WHERE active = 1").run();
    db.prepare("UPDATE ai_configs SET active = 1 WHERE version = ?").run(version);
    appendAudit(db, { actor: p.id, actor_role: p.role, action: "konfigurasi_ai_diaktifkan", entity: "ai_config", entity_id: String(version), detail: { dari_versi: prev.version, alasan: note.trim().slice(0, 200) } });
  })();
}

export async function testActiveConnection(db: Database.Database, p: Principal) {
  assertCan(p, "ai.config");
  const r = await testConnection(db, getActiveConfig(db), p.id);
  appendAudit(db, { actor: p.id, actor_role: p.role, action: "uji_koneksi_ai", entity: "ai_config", entity_id: String(getActiveConfig(db).version), detail: { mode: r.mode, ok: r.ok } });
  return r;
}

/* ---------- Sumber standar ---------- */
export function standardsSource(db: Database.Database, p: Principal) {
  assertCan(p, "ai.view");
  const versions = listStandardVersions(db);
  const bank = loadBank(db);
  const used = db.prepare("SELECT indicator_versions_json j, uses_draft d FROM survey_sessions WHERE is_sandbox = 0").all() as { j: string; d: number }[];
  const usage = new Map<string, number>();
  for (const u of used) for (const id of json<string[]>(u.j, [])) usage.set(id, (usage.get(id) ?? 0) + 1);
  const sources = new Map(listSources(db).map((s) => [s.id, s]));
  return {
    sessions_total: used.length,
    sessions_with_draft: used.filter((u) => u.d).length,
    versions,
    indicators: bank.indicators.filter((i) => i.indicator_id !== PROBE_INDICATOR).map((i) => {
      const v = versions.find((x) => x.id === i.standard_version_id);
      const src = i.source_id ? sources.get(i.source_id) : undefined;
      return {
        id: i.id, indicator_id: i.indicator_id, title: i.title, stage: i.stage, kind: i.kind, scope: i.scope, standard_version: v ? `${v.standard_name} ${v.version}` : i.standard_version_id, status: v?.status ?? "draft",
        locator: i.locator, source: src ? { id: src.id, title: src.title, validation_status: src.validation_status, validation_owner: src.validation_owner } : null, observable_by_patient: i.observable_by_patient, sessions_using: usage.get(i.id) ?? 0,
        questions: bank.questions.filter((q) => q.indicator_version_id === i.id).map((q) => ({ id: q.id, text: q.text, target_slot: q.target_slot, core: q.is_core })),
      };
    }),
    note: "Butir berstatus 'draft' belum divalidasi pemilik proses (dr. Yuli). Sesi yang memakainya diberi label dan tidak boleh dijadikan dasar klaim kepatuhan resmi.",
  };
}

/* ---------- Sandbox ---------- */
export interface SandboxVariant { prompt_version: string; mode: "simulated" | "live"; model?: string; fault?: Fault | null }
export interface SandboxSpec {
  name?: string;
  stage: Stage;
  episode_kind: "RITL" | "RJTL";
  facility_kind: "hospital" | "puskesmas";
  context: Record<string, boolean>;
  facts: { slot: string; value: string }[];
  question_id: string;
  answer_text: string;
  a: SandboxVariant;
  b?: SandboxVariant | null;
}
const specZ = z.strictObject({
  name: z.string().max(80).optional(),
  stage: z.enum(["pre", "intra", "post", "directed"]),
  episode_kind: z.enum(["RITL", "RJTL"]),
  facility_kind: z.enum(["hospital", "puskesmas"]),
  context: z.record(z.string(), z.boolean()),
  facts: z.array(z.strictObject({ slot: z.string(), value: z.string() })).max(20),
  question_id: z.string().min(1),
  answer_text: z.string().min(1).max(600),
  a: z.strictObject({ prompt_version: z.string(), mode: z.enum(["simulated", "live"]), model: z.string().max(80).optional(), fault: z.enum(["timeout", "unavailable", "invalid_json", "stale_revision", "illegal_candidate", "bad_quote"]).nullable().optional() }),
  b: z.strictObject({ prompt_version: z.string(), mode: z.enum(["simulated", "live"]), model: z.string().max(80).optional(), fault: z.enum(["timeout", "unavailable", "invalid_json", "stale_revision", "illegal_candidate", "bad_quote"]).nullable().optional() }).nullable().optional(),
});

export function sandboxOptions(db: Database.Database, p: Principal) {
  assertCan(p, "ai.sandbox");
  const bank = loadBank(db);
  return {
    questions: bank.questions.filter((q) => !q.indicator_version_id.startsWith(PROBE_INDICATOR)).map((q) => {
      const ind = bank.indicators.find((i) => i.id === q.indicator_version_id)!;
      return { id: q.id, text: q.text, stage: ind.stage, target_slot: q.target_slot, scope: ind.scope, indicator: ind.title };
    }),
    slots: bank.indicators.flatMap((i) => i.slots.map((s) => ({ slot: s.id, label: s.label, values: s.values, stage: i.stage }))),
    prompts: Object.values(PROMPTS).map((d) => ({ version: d.version, title: d.title })),
    live_available: liveAvailable(),
    faults: ["timeout", "unavailable", "invalid_json", "stale_revision", "illegal_candidate", "bad_quote"],
  };
}

function sandboxInput(db: Database.Database, spec: SandboxSpec, sandboxId: string) {
  const bank = loadBank(db);
  const scope = [spec.facility_kind, spec.episode_kind === "RITL" ? "inpatient_discharge" : "outpatient"];
  const inds = bank.indicators.filter((i) => (i.stage === spec.stage && scopeMatches(i.scope, scope)) || i.indicator_id === PROBE_INDICATOR);
  const ids = new Set(inds.map((i) => i.id));
  const questions = bank.questions.filter((q) => ids.has(q.indicator_version_id));
  const q = questions.find((x) => x.id === spec.question_id);
  if (!q) throw new DomainError("Pertanyaan tidak berlaku untuk konfigurasi sandbox ini (tahap atau cakupan berbeda).", 422);
  const facts = Object.fromEntries(spec.facts.map((f) => [factKey(f.slot, null), f.value]));
  const cfg = getActiveConfig(db);
  const { input } = composeInterviewInput({
    session_id: sandboxId, revision: 0, stage: spec.stage, indicator_version_ids: inds.map((i) => i.id), indicators: inds, questions, scope, context: spec.context as RuleContext, subject: null, subjectInfo: null,
    facts, factRows: spec.facts.map((f) => ({ ...f, subject: null })), askedIds: [spec.question_id], coreAsked: 1, clarifAsked: 0, budgetCore: cfg.budget_core, budgetClarif: cfg.budget_clarif,
    turn: { id: `${sandboxId}-T1`, question_id: q.id, question_text: q.text }, answerText: spec.answer_text,
  });
  return input;
}

const brief = (r: InterviewResult) => ({
  mode: r.mode, status: r.status, provider: r.provider, model: r.model, latency_ms: r.latency_ms, fallback_reason: r.fallback_reason, prompt_version: r.prompt_version, invocation_id: r.invocation_id,
  accepted: r.report.accepted, rejected: r.report.rejected, next_question_id: r.report.next_question_id, next_issue: r.report.next_issue, reason_code: r.report.reason_code, uncertainties: r.report.uncertainties,
  needs_human_help: r.report.needs_human_help, phrase_suggestion: r.report.phrase_suggestion, phrase_issue: r.report.phrase_issue,
});
export type SandboxResult = ReturnType<typeof brief>;

/** Sandbox tidak membuat fakta, sesi nyata, atau temuan. Pemanggilan dicatat dengan operasi 'sandbox' dan tidak masuk metrik operasional. */
export async function runSandbox(db: Database.Database, p: Principal, raw: unknown) {
  assertCan(p, "ai.sandbox");
  const spec = specZ.parse(raw) as SandboxSpec;
  for (const v of [spec.a, spec.b]) if (v && !(v.prompt_version in PROMPTS)) throw new DomainError("Versi prompt tidak dikenal.", 422);
  const id = nextId(db, "SBX");
  const input = sandboxInput(db, spec, id);
  const run = async (v: SandboxVariant) => brief(await runInterview(db, { ...input }, { operation: "sandbox", sandbox_id: id, forceMode: v.mode, promptVersion: v.prompt_version, model: v.model, fault: v.fault ?? null }));
  const a = await run(spec.a);
  const b = spec.b ? await run(spec.b) : null;
  db.prepare("INSERT INTO sandbox_runs (id, name, input_json, config_a_json, config_b_json, output_a_json, output_b_json, corrected_json, created_by, created_at) VALUES (?,?,?,?,?,?,?,NULL,?,?)").run(
    id, spec.name ?? null, JSON.stringify({ spec: { ...spec, a: undefined, b: undefined }, request: input }), JSON.stringify(spec.a), spec.b ? JSON.stringify(spec.b) : null, JSON.stringify(a), b ? JSON.stringify(b) : null, p.id, nowPrecise(),
  );
  appendAudit(db, { actor: p.id, actor_role: p.role, action: "sandbox_dijalankan", entity: "sandbox_run", entity_id: id, detail: { pertanyaan: spec.question_id, a: spec.a.prompt_version, b: spec.b?.prompt_version ?? null } });
  return { id, request: input, a, b };
}

export function listSandboxRuns(db: Database.Database, p: Principal) {
  assertCan(p, "ai.sandbox");
  return (db.prepare("SELECT * FROM sandbox_runs ORDER BY created_at DESC, id DESC LIMIT 30").all() as Record<string, string | null>[]).map((r) => ({
    id: r.id, name: r.name, created_by: r.created_by, created_at: r.created_at, input: json(r.input_json, null), config_a: json(r.config_a_json, null), config_b: json(r.config_b_json, null), output_a: json(r.output_a_json, null), output_b: json(r.output_b_json, null), corrected: json(r.corrected_json, null),
  }));
}

/** Koreksi manusia pada keluaran sandbox (jawaban benar menurut reviewer). Dipakai sebagai bahan evaluasi, bukan mengubah apa pun pada sesi nyata. */
export function correctSandbox(db: Database.Database, p: Principal, id: string, corrected: { slot: string; value: string }[], note: string) {
  assertCan(p, "ai.sandbox");
  const ok = z.array(z.strictObject({ slot: z.string(), value: z.string() })).max(10).parse(corrected);
  db.transaction(() => {
    const r = db.prepare("SELECT id FROM sandbox_runs WHERE id = ?").get(id);
    if (!r) throw new DomainError("Eksperimen sandbox tidak ditemukan.", 404);
    db.prepare("UPDATE sandbox_runs SET corrected_json = ? WHERE id = ?").run(JSON.stringify({ facts: ok, note: note.slice(0, 300), by: p.id, at: nowPrecise() }), id);
    appendAudit(db, { actor: p.id, actor_role: p.role, action: "sandbox_dikoreksi", entity: "sandbox_run", entity_id: id, detail: { jumlah: ok.length } });
  })();
}
