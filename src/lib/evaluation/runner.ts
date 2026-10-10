import type Database from "better-sqlite3";
import { z } from "zod";
import { AI_SCHEMA_VERSION } from "../ai/contract";
import { getActiveConfig, logInvocation } from "../ai/invocations";
import { appendAudit } from "../audit";
import { assertCan, type Principal } from "../auth/principal";
import { nowIso, nowPrecise } from "../clock";
import { json, nextId } from "../db";
import { DomainError } from "../idem";
import { loadBank } from "../standards/registry";
import type { StageKey } from "../standards/types";
import { DATASET_ID, BUDGETS, loadCases } from "./dataset";
import { computeRunMetrics, getRun, runResults, type RunRow } from "./metrics";
import { buildTurnContext, runSession, runTurn, type LlmOpts, type TurnContext, type TurnOutcome } from "./pipeline";
import { ProviderUnavailableError, providerMeta, resolveProvider } from "./provider";
import "./live";
import { scoreSession, scoreTurn } from "./score";
import type { CaseResult, EvalCaseDef, EvalSystem, SessionInput, TurnInput } from "./types";

/* Runner evaluasi. Menulis HANYA ke: eval_runs, eval_case_results, ai_invocations (operasi 'eval_case'), audit_log, idempotency_keys dan penghitung ID.
   Tidak menyentuh sesi, fakta, temuan, kasus, pending, kartu, atau pembayaran (dibuktikan oleh tes). */

export const runRequestZ = z.strictObject({
  split: z.enum(["dev", "heldout", "all"]).default("dev"),
  systems: z.array(z.enum(["baseline_rules", "rules_plus_llm"])).min(1).max(2).default(["baseline_rules", "rules_plus_llm"]),
  provider: z.enum(["auto", "simulated", "live"]).default("auto"),
  idempotency_key: z.string().min(1).max(80).nullish(),
  note: z.string().max(200).nullish(),
});
export type RunRequest = z.input<typeof runRequestZ>;

export interface RunOptions {
  /** Batas total waktu satu run (ms). Lewat batas → run ditandai gagal, hasil sebagian tetap tersimpan. */
  deadlineMs?: number;
  /** Paralelisme untuk penyedia langsung. Simulasi dan aturan selalu berurutan. */
  concurrency?: number;
}

const IDEM_SCOPE = "eval.run";

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>, stop: () => boolean) {
  let i = 0;
  const worker = async () => {
    while (i < items.length && !stop()) {
      const x = items[i++];
      await fn(x);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(size, items.length)) }, worker));
}

export interface RunOutcome { replayed: boolean; run_ids: string[]; runs: RunRow[] }

/** Jalankan evaluasi untuk satu atau dua sistem pada dataset tersimpan. Menolak bila penyedia langsung diminta tetapi tidak tersedia (tidak pernah diganti diam-diam). */
export async function startEvaluation(db: Database.Database, p: Principal, raw: RunRequest, opts: RunOptions = {}): Promise<RunOutcome> {
  assertCan(p, "ai.eval");
  const req = runRequestZ.parse(raw);
  const key = req.idempotency_key ?? null;
  const scope = `${IDEM_SCOPE}:${p.id}`;

  if (key) {
    const claimed = db.transaction(() => {
      const row = db.prepare("SELECT result_json FROM idempotency_keys WHERE scope = ? AND key = ?").get(scope, key) as { result_json: string | null } | undefined;
      if (row) return row.result_json === null ? "pending" : (row.result_json as string);
      db.prepare("INSERT INTO idempotency_keys (scope, key, result_json, created_at) VALUES (?,?,NULL,?)").run(scope, key, nowPrecise());
      return null;
    })();
    if (claimed === "pending") throw new DomainError("Evaluasi dengan kunci ini masih berjalan.", 409, "in_progress");
    if (claimed) {
      const ids = json<string[]>(claimed, []);
      return { replayed: true, run_ids: ids, runs: ids.map((id) => getRun(db, id)).filter((r): r is RunRow => !!r) };
    }
  }
  const release = () => { if (key) db.prepare("DELETE FROM idempotency_keys WHERE scope = ? AND key = ? AND result_json IS NULL").run(scope, key); };

  let ids: string[] = [];
  try {
    const dataset = db.prepare("SELECT id FROM datasets WHERE id = ?").get(DATASET_ID);
    if (!dataset) throw new DomainError("Dataset evaluasi belum tersedia.", 409, "no_dataset");
    const cases = loadCases(db, DATASET_ID, req.split);
    if (!cases.length) throw new DomainError("Tidak ada kasus pada split yang dipilih.", 422);
    const cfg = getActiveConfig(db);
    const wantsLlm = req.systems.includes("rules_plus_llm");
    let resolved: ReturnType<typeof resolveProvider> | null = null;
    if (wantsLlm) {
      try { resolved = resolveProvider(db, req.provider); } catch (e) {
        if (e instanceof ProviderUnavailableError) throw new DomainError(e.message, 409, e.code);
        throw e;
      }
    }
    const bank = loadBank(db, { allowDraft: true });
    const deadline = Date.now() + (opts.deadlineMs ?? 10 * 60_000);

    for (const system of req.systems) {
      const llm = system === "rules_plus_llm" && resolved ? resolved : null;
      const meta = llm ? providerMeta(db, llm) : null;
      const runId = nextId(db, "ER");
      ids.push(runId);
      db.prepare("INSERT INTO eval_runs (id, dataset_id, system, mode, provider, model, prompt_version, config_version, split, sample_size, started_at, status, note) VALUES (?,?,?,?,?,?,?,?,?,?,?, 'running', ?)").run(
        runId, DATASET_ID, system, llm ? llm.mode : "rules", llm ? meta!.provider : null, llm ? meta!.model : null, llm ? meta!.prompt_version : null, llm ? meta!.config_version : cfg.version, req.split, cases.length, nowIso(), req.note ?? null,
      );
      appendAudit(db, { actor: p.id, actor_role: p.role, action: "evaluasi_dijalankan", entity: "eval_run", entity_id: runId, detail: { system, split: req.split, mode: llm ? llm.mode : "rules", provider: llm ? meta!.provider : null, cases: cases.length } });

      const llmOpts: LlmOpts | null = llm ? { provider: llm.adapter, mode: llm.mode, timeoutMs: cfg.timeout_ms, model: meta!.model ?? undefined, promptVersion: cfg.prompt_version } : null;
      const results: CaseResult[] = [];
      let failedNote: string | null = null;
      const invoke = (def: EvalCaseDef) => (out: TurnOutcome, ctx: TurnContext) => {
        if (!out.log) return;
        logInvocation(db, { operation: "eval_case", eval_run_id: runId, case_id: def.id, session_id: null, turn_id: ctx.request.last_turn.turn_id, prompt_version: cfg.prompt_version, schema_version: AI_SCHEMA_VERSION, config_version: cfg.version, ...out.log });
      };
      const exec = async (def: EvalCaseDef) => {
        if (Date.now() > deadline) { failedNote ??= "Melewati batas waktu run; hasil sebagian disimpan."; return; }
        let res: CaseResult;
        if (def.label.kind === "turn") {
          const ctx = buildTurnContext(bank, def.id, def.stage as StageKey, def.input as TurnInput, BUDGETS, 1, runId);
          const out = await runTurn(ctx, system, llmOpts);
          invoke(def)(out, ctx);
          res = scoreTurn(def, ctx, out, system);
        } else {
          const trace = await runSession(bank, def.id, def.input as SessionInput, system, llmOpts, BUDGETS, runId, invoke(def));
          res = scoreSession(def, trace, system);
        }
        results.push(res);
        db.prepare("INSERT INTO eval_case_results (run_id, case_id, output_json, correct, failure_types_json, latency_ms) VALUES (?,?,?,?,?,?)").run(runId, def.id, JSON.stringify(res), res.correct ? 1 : 0, JSON.stringify(res.failures), res.latency_ms ?? null);
      };
      try {
        if (llm && llm.mode === "live") await pool(cases, opts.concurrency ?? 4, exec, () => Date.now() > deadline);
        else for (const c of cases) { await exec(c); if (failedNote) break; }
        if (Date.now() > deadline && results.length < cases.length) failedNote ??= "Melewati batas waktu run; hasil sebagian disimpan.";
      } catch (e) {
        failedNote = `Run berhenti karena galat: ${e instanceof Error ? e.message.slice(0, 160) : "tidak dikenal"}`;
      }
      const metrics = computeRunMetrics(results.sort((a, b) => a.case_id.localeCompare(b.case_id)));
      const status = failedNote ? "failed" : "completed";
      db.prepare("UPDATE eval_runs SET status = ?, finished_at = ?, metrics_json = ?, sample_size = ?, note = COALESCE(?, note) WHERE id = ?").run(status, nowIso(), JSON.stringify(metrics), results.length, failedNote, runId);
      appendAudit(db, { actor: p.id, actor_role: p.role, action: "evaluasi_selesai", entity: "eval_run", entity_id: runId, detail: { system, status, cases: results.length, correct: results.filter((r) => r.correct).length } });
      if (failedNote) break;
    }
    if (key) db.prepare("UPDATE idempotency_keys SET result_json = ? WHERE scope = ? AND key = ?").run(JSON.stringify(ids), scope, key);
    return { replayed: false, run_ids: ids, runs: ids.map((id) => getRun(db, id)).filter((r): r is RunRow => !!r) };
  } catch (e) {
    if (ids.length === 0) release();
    else if (key) db.prepare("UPDATE idempotency_keys SET result_json = ? WHERE scope = ? AND key = ?").run(JSON.stringify(ids), scope, key);
    throw e;
  }
}

export { getRun, runResults };
