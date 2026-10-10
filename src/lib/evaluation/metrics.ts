import type Database from "better-sqlite3";
import { json } from "../db";
import { mean, percentile, ratio, wilson, type Interval } from "../quality/stats";
import { isMetaValue } from "../survey/engine";
import type { CaseResult, EvalSplit, FailureType, Proposal } from "./types";

/* Metrik evaluasi (master prompt §13). Setiap proporsi membawa k, n dan interval Wilson 95%.
   Tidak ada angka tanpa penyebut: bila n = 0 nilainya null dan antarmuka menampilkan "belum dievaluasi" / "tidak ada kasus". */

export interface Rate { k: number; n: number; value: number | null; ci: Interval | null }
export const rate = (k: number, n: number): Rate => ({ k, n, value: ratio(k, n), ci: wilson(k, n) });

export interface SlotScore { slot: string; tp: number; fp: number; fn: number; support: number; precision: number | null; recall: number | null; f1: number | null }
const f1of = (p: number | null, r: number | null) => (p !== null && r !== null && p + r > 0 ? (2 * p * r) / (p + r) : p !== null && r !== null ? 0 : null);

export interface CoreMetrics {
  n_cases: number; n_turn: number; n_session: number;
  turn_exact: Rate;
  extraction: { precision: Rate; recall: Rate; f1: number | null; macro_f1: number | null; per_slot: SlotScore[] };
  unknown_handling: { exact: Rate; as_value: Rate };
  source_support: Rate;
  selection: { accuracy: Rate; forbidden: Rate; pick_current: Rate | null; repeated_picks: number };
  adversarial: Rate;
  session: { n: number; correct: Rate; completion: Rate; final_fact_accuracy: Rate; coverage_mean: number | null; turns_mean: number | null; must_not_ask_violations: Rate } | null;
  reliability: { calls: number; invalid: Rate; fallback: Rate };
  latency: { measured: boolean; p50: number | null; p95: number | null; n: number };
  usage: { tokens_in: number | null; tokens_out: number | null; cost_usd: number | null; available: boolean };
  failures: { type: FailureType; n: number; cases: number }[];
}
export interface RunMetrics extends CoreMetrics {
  version: 1;
  by_split: Partial<Record<EvalSplit, CoreMetrics>>;
}

const META = (v: string) => isMetaValue(v);
const key = (p: { slot: string; value: string }) => `${p.slot}=${p.value}`;

export function computeCore(results: CaseResult[]): CoreMetrics {
  const turns = results.filter((r) => r.kind === "turn");
  const sessions = results.filter((r) => r.kind === "session");

  const slots = new Map<string, { tp: number; fp: number; fn: number; support: number }>();
  const slot = (s: string) => { let v = slots.get(s); if (!v) slots.set(s, (v = { tp: 0, fp: 0, fn: 0, support: 0 })); return v; };
  let tp = 0, fp = 0, fn = 0;
  let metaGold = 0, metaExact = 0, metaAsValue = 0;
  for (const r of turns) {
    const gold = r.gold ?? [];
    const gk = new Set(gold.map(key));
    const pk = new Set(r.proposals.map(key));
    for (const g of gold) {
      slot(g.slot).support++;
      if (pk.has(key(g))) { tp++; slot(g.slot).tp++; } else { fn++; slot(g.slot).fn++; }
      if (META(g.value)) {
        metaGold++;
        if (pk.has(key(g))) metaExact++;
        else if (r.proposals.some((p) => p.slot === g.slot && !META(p.value))) metaAsValue++;
      }
    }
    for (const p of r.proposals) if (!gk.has(key(p))) { fp++; slot(p.slot).fp++; }
  }
  const perSlot: SlotScore[] = [...slots.entries()].map(([s, v]) => {
    const precision = ratio(v.tp, v.tp + v.fp);
    const recall = ratio(v.tp, v.tp + v.fn);
    return { slot: s, ...v, precision, recall, f1: f1of(precision, recall) };
  }).sort((a, b) => b.support - a.support || a.slot.localeCompare(b.slot));
  const microP = rate(tp, tp + fp), microR = rate(tp, tp + fn);
  const macro = perSlot.filter((s) => s.support > 0 && s.f1 !== null).map((s) => s.f1 as number);

  const rawSupport = results.reduce((a, r) => ({ raw: a.raw + r.support.raw, ok: a.ok + r.support.supported }), { raw: 0, ok: 0 });
  const llmTurns = turns.filter((r) => r.calls.n > 0);
  const selTurns = turns;
  const forbiddenN = turns.filter((r) => r.failures.includes("forbidden_next")).length;
  const callsN = results.reduce((a, r) => a + r.calls.n, 0);
  const lat = results.flatMap((r) => r.calls.latencies);
  const liveLike = results.some((r) => r.mode === "live");
  const tokIn = results.filter((r) => r.tokens_in !== null), tokOut = results.filter((r) => r.tokens_out !== null), cost = results.filter((r) => r.cost_usd !== null);

  const failCount = new Map<FailureType, { n: number; cases: Set<string> }>();
  for (const r of results) for (const f of r.failures) { let v = failCount.get(f); if (!v) failCount.set(f, (v = { n: 0, cases: new Set() })); v.n++; v.cases.add(r.case_id); }

  const adv = results.filter((r) => r.adversarial);

  return {
    n_cases: results.length, n_turn: turns.length, n_session: sessions.length,
    turn_exact: rate(turns.filter((r) => r.correct).length, turns.length),
    extraction: { precision: microP, recall: microR, f1: f1of(microP.value, microR.value), macro_f1: mean(macro), per_slot: perSlot },
    unknown_handling: { exact: rate(metaExact, metaGold), as_value: rate(metaAsValue, metaGold) },
    source_support: rate(rawSupport.ok, rawSupport.raw),
    selection: {
      accuracy: rate(selTurns.filter((r) => !r.failures.includes("bad_next") && !r.failures.includes("forbidden_next")).length, selTurns.length),
      forbidden: rate(forbiddenN, selTurns.length),
      pick_current: llmTurns.length ? rate(llmTurns.reduce((a, r) => a + r.calls.pick_current, 0), llmTurns.reduce((a, r) => a + r.calls.n - r.calls.fallback, 0)) : null,
      repeated_picks: results.reduce((a, r) => a + r.calls.repeated, 0),
    },
    adversarial: rate(adv.filter((r) => r.correct).length, adv.length),
    session: sessions.length ? {
      n: sessions.length,
      correct: rate(sessions.filter((r) => r.correct).length, sessions.length),
      completion: rate(sessions.filter((r) => r.session?.finished).length, sessions.length),
      final_fact_accuracy: rate(sessions.reduce((a, r) => a + (r.session?.final_correct ?? 0), 0), sessions.reduce((a, r) => a + (r.session?.final_total ?? 0), 0)),
      coverage_mean: mean(sessions.map((r) => r.session?.coverage).filter((x): x is number => typeof x === "number")),
      turns_mean: mean(sessions.map((r) => r.session?.turns ?? 0)),
      must_not_ask_violations: rate(sessions.filter((r) => r.failures.includes("forbidden_question_asked")).length, sessions.length),
    } : null,
    reliability: {
      calls: callsN,
      invalid: rate(results.reduce((a, r) => a + r.calls.invalid, 0), callsN),
      fallback: rate(results.reduce((a, r) => a + r.calls.fallback, 0), callsN),
    },
    // Latensi hanya bermakna untuk model sungguhan: pada simulasi, itu waktu hitung lokal yang tidak mewakili apa pun.
    latency: { measured: liveLike && lat.length > 0, p50: liveLike ? percentile(lat, 0.5) : null, p95: liveLike ? percentile(lat, 0.95) : null, n: lat.length },
    usage: {
      tokens_in: tokIn.length ? tokIn.reduce((a, r) => a + (r.tokens_in ?? 0), 0) : null,
      tokens_out: tokOut.length ? tokOut.reduce((a, r) => a + (r.tokens_out ?? 0), 0) : null,
      cost_usd: cost.length ? cost.reduce((a, r) => a + (r.cost_usd ?? 0), 0) : null,
      available: tokIn.length + tokOut.length + cost.length > 0,
    },
    failures: [...failCount.entries()].map(([type, v]) => ({ type, n: v.n, cases: v.cases.size })).sort((a, b) => b.cases - a.cases),
  };
}

export function computeRunMetrics(results: CaseResult[]): RunMetrics {
  const by: RunMetrics["by_split"] = {};
  for (const sp of ["dev", "heldout"] as const) {
    const part = results.filter((r) => r.split === sp);
    if (part.length) by[sp] = computeCore(part);
  }
  return { version: 1, ...computeCore(results), by_split: by };
}

/* ---------- Status kepala (apa yang boleh diklaim) ---------- */

export type EvalStatus =
  | { kind: "not_evaluated" }
  | { kind: "simulated_only"; runs: number; last_at: string | null }
  | { kind: "live_evaluated"; runs: number; last_at: string | null; model: string | null; provider: string | null };

/** Satu-satunya sumber pernyataan "akurasi AI". Tanpa run selesai → belum dievaluasi. Hanya simulasi/aturan → bukan akurasi model. */
export function evaluationStatus(db: Database.Database): EvalStatus {
  const rows = db.prepare("SELECT mode, provider, model, finished_at FROM eval_runs WHERE status = 'completed' AND system = 'rules_plus_llm' ORDER BY finished_at DESC, id DESC").all() as { mode: string; provider: string | null; model: string | null; finished_at: string | null }[];
  const any = (db.prepare("SELECT COUNT(*) c FROM eval_runs WHERE status = 'completed'").get() as { c: number }).c;
  if (!any) return { kind: "not_evaluated" };
  const live = rows.filter((r) => r.mode === "live");
  if (live.length) return { kind: "live_evaluated", runs: live.length, last_at: live[0].finished_at, model: live[0].model, provider: live[0].provider };
  return { kind: "simulated_only", runs: any, last_at: (db.prepare("SELECT MAX(finished_at) m FROM eval_runs WHERE status = 'completed'").get() as { m: string | null }).m };
}

export const STATUS_TEXT: Record<EvalStatus["kind"], string> = {
  not_evaluated: "Belum dievaluasi",
  simulated_only: "Belum ada evaluasi model AI langsung",
  live_evaluated: "Dievaluasi dengan model langsung",
};

/* ---------- Penyimpanan hasil ---------- */

export interface RunRow {
  id: string; dataset_id: string; system: "baseline_rules" | "rules_plus_llm"; mode: string; provider: string | null; model: string | null; prompt_version: string | null; config_version: number | null;
  split: string; sample_size: number; started_at: string | null; finished_at: string | null; status: "running" | "completed" | "failed"; metrics: RunMetrics | null; note: string | null;
}
const toRun = (r: Record<string, unknown>): RunRow => ({ ...(r as unknown as RunRow), metrics: json<RunMetrics | null>(r.metrics_json as string | null, null) });

export function listRuns(db: Database.Database, limit = 40): RunRow[] {
  return (db.prepare("SELECT * FROM eval_runs ORDER BY started_at DESC, id DESC LIMIT ?").all(limit) as Record<string, unknown>[]).map(toRun);
}
export function getRun(db: Database.Database, id: string): RunRow | null {
  const r = db.prepare("SELECT * FROM eval_runs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? toRun(r) : null;
}
export function runResults(db: Database.Database, runId: string): CaseResult[] {
  const rows = db.prepare("SELECT output_json FROM eval_case_results WHERE run_id = ? ORDER BY id").all(runId) as { output_json: string }[];
  return rows.map((r) => json<CaseResult>(r.output_json, null as unknown as CaseResult)).filter(Boolean);
}
export type { Proposal };
