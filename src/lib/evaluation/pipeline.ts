import { AI_SCHEMA_VERSION, ProviderError, type AIProviderAdapter, type InterviewRequest } from "../ai/contract";
import type { InvocationLog } from "../ai/invocations";
import type { RuleContext } from "../standards/applicability";
import type { IndicatorVersionRow, QuestionRow, StageKey } from "../standards/types";
import { PROBE_INDICATOR, computeAgenda, proposableSlots, type Agenda, type Candidate } from "../survey/engine";
import { extractBaseline, type SlotInfo } from "./lexicon";
import type { EvalSystem, Proposal, ResultMode, SessionInput, TurnInput } from "./types";
import { validateInterviewOutput, type Issue, type Rejected } from "./validate";

/* Replika langkah satu giliran wawancara untuk evaluasi:
   1. aturan membaca jawaban terakhir → fakta sementara;
   2. mesin agenda menghitung kandidat pertanyaan dari fakta terkonfirmasi + sementara (kandidat HANYA dari aturan);
   3. sistem 'baseline_rules' memakai hasil aturan apa adanya; 'rules_plus_llm' meminta penyedia mengusulkan fakta dan memilih di antara kandidat;
   4. keluaran penyedia divalidasi; gagal seluruhnya → hasil aturan (fallback); butir bermasalah ditolak satu per satu.
   Kode ini TIDAK menulis ke basis data. Pencatatan dilakukan pemanggil. */

export interface Bank { indicators: IndicatorVersionRow[]; questions: QuestionRow[] }
export interface Budgets { core: number; clarif: number }
export interface LlmOpts { provider: AIProviderAdapter; mode: "live" | "simulated"; timeoutMs: number; model?: string; promptVersion: string }

export interface TurnContext {
  caseId: string;
  stage: StageKey;
  request: InterviewRequest;
  candidates: Candidate[];
  allowed: SlotInfo[];
  askedSlot: string;
  baseline: Proposal[];
  asked: string[];
  /** Kandidat yang diizinkan aturan SETELAH usulan fakta yang lolos validasi diterapkan (aturan, bukan model, yang menentukan kelayakan akhir). */
  eligibleAfter: (proposals: Proposal[]) => string[];
}

export interface TurnOutcome {
  proposals: Proposal[];
  rejected: Rejected[];
  /** Pertanyaan berikut yang benar-benar dipakai: pilihan sistem bila masih sah menurut aturan atas fakta yang lolos validasi, selain itu kandidat pertama aturan. */
  next: string | null;
  /** Pilihan mentah sistem sebelum aturan menghitung ulang (baseline: kandidat pertama). */
  pick: string | null;
  /** Pilihan mentah sah menurut aturan atas fakta yang lolos validasi (null dan tidak ada kandidat juga dihitung sah). */
  pickCurrent: boolean;
  mode: ResultMode;
  invalid: boolean;
  fallback: boolean;
  errorCode: string | null;
  issues: Issue[];
  latencyMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  rawCount: number;
  rawSupported: number;
  needsHelp: boolean;
  /** Bahan catatan pemanggilan AI; hanya ada bila penyedia benar-benar dipanggil. */
  log: Pick<InvocationLog, "status" | "error_code" | "reason_code" | "request" | "response" | "validation" | "fallback_reason" | "latency_ms" | "tokens_in" | "tokens_out" | "cost_usd" | "provider" | "model" | "mode"> | null;
}

export function pickIndicators(bank: Bank, stage: StageKey, ids: string[]) {
  const inds = bank.indicators.filter((i) => i.stage === stage && ids.includes(i.indicator_id));
  const probes = bank.indicators.filter((i) => i.indicator_id === PROBE_INDICATOR);
  const all = [...inds, ...probes];
  const vids = new Set(all.map((i) => i.id));
  return { indicators: all, questions: bank.questions.filter((q) => vids.has(q.indicator_version_id)), versions: inds.map((i) => i.id) };
}

const toFacts = (list: { slot: string; value: string }[]) => Object.fromEntries(list.map((f) => [f.slot, f.value]));

export function countBudget(bank: Bank, asked: string[]) {
  let core = 0, clarif = 0;
  for (const id of asked) {
    const q = bank.questions.find((x) => x.id === id);
    if (!q) continue;
    if (q.is_core) core++; else clarif++;
  }
  return { core, clarif };
}

/** Slot yang boleh diusulkan: slot indikator yang berlaku atau menunggu + slot pertanyaan prasyarat yang belum terisi. */
export function allowedSlotsFor(agenda: Agenda, bank: Bank, facts: Record<string, string>): SlotInfo[] {
  const m = proposableSlots(agenda);
  for (const ind of bank.indicators.filter((i) => i.indicator_id === PROBE_INDICATOR)) {
    for (const s of ind.slots) if (!(s.id in facts) && !m.has(s.id)) m.set(s.id, [...s.values, "unknown", "not_understood", "not_applicable"]);
  }
  return [...m.entries()].map(([slot, values]) => ({ slot, values }));
}

function agendaFor(bank: Bank, stage: StageKey, ids: string[], scope: string[], context: Record<string, string | boolean | number | null>, facts: Record<string, string>, asked: string[], budgets: Budgets) {
  const sub = pickIndicators(bank, stage, ids);
  const used = countBudget({ indicators: sub.indicators, questions: sub.questions }, asked);
  return { sub, agenda: computeAgenda({ stage, indicators: sub.indicators, questions: sub.questions, scopeTags: scope, context: context as RuleContext, facts, asked, coreAsked: used.core, clarifAsked: used.clarif, budgetCore: budgets.core, budgetClarif: budgets.clarif }) };
}

export function buildTurnContext(bank: Bank, caseId: string, stage: StageKey, input: Omit<TurnInput, "stage">, budgets: Budgets, turnNo = 1, runKey = "eval"): TurnContext {
  const asked = input.asked_question_ids.includes(input.last_turn.question_id) ? input.asked_question_ids : [...input.asked_question_ids, input.last_turn.question_id];
  const confirmed = toFacts(input.confirmed_facts);
  const q = bank.questions.find((x) => x.id === input.last_turn.question_id);
  if (!q) throw new Error(`Kasus ${caseId}: pertanyaan ${input.last_turn.question_id} tidak ada di bank.`);
  const { sub, agenda: agenda0 } = agendaFor(bank, stage, input.indicators, input.scope_tags, input.episode_context, confirmed, asked, budgets);
  const allowed = allowedSlotsFor(agenda0, bank, confirmed);
  const baseline = extractBaseline(q.target_slot, input.last_turn.answer_text, allowed);
  const tentative = { ...confirmed, ...toFacts(baseline) };
  const { agenda } = agendaFor(bank, stage, input.indicators, input.scope_tags, input.episode_context, tentative, asked, budgets);
  const turnId = `T-${caseId}-${turnNo}`;
  const request: InterviewRequest = {
    schema_version: AI_SCHEMA_VERSION,
    request_id: `${runKey}:${caseId}:${turnNo}`,
    session_id: `EVAL-${caseId}`,
    session_revision: input.confirmed_facts.length,
    stage,
    indicator_versions: sub.versions,
    episode_context: input.episode_context,
    confirmed_facts: input.confirmed_facts.map((f) => ({ slot: f.slot, value: f.value })),
    asked_question_ids: asked,
    last_turn: { turn_id: turnId, question_id: q.id, question_text: q.text, answer_text: input.last_turn.answer_text },
    candidate_questions: agenda.eligible.map((c) => ({ id: c.question.id, target_slot: c.question.target_slot, text: c.question.text })),
    allowed_slots: allowed,
  };
  const eligibleAfter = (props: Proposal[]) => agendaFor(bank, stage, input.indicators, input.scope_tags, input.episode_context, { ...confirmed, ...toFacts(props) }, asked, budgets).agenda.eligible.map((c) => c.question.id);
  return { caseId, stage, request, candidates: agenda.eligible, allowed, askedSlot: q.target_slot, baseline, asked, eligibleAfter };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timer = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new ProviderError(`Melebihi batas waktu ${ms} ms.`, "timeout", true)), ms); });
  return Promise.race([p, timer]).finally(() => clearTimeout(t));
}

function settle(ctx: TurnContext, proposals: Proposal[], pick: string | null) {
  const after = ctx.eligibleAfter(proposals);
  const pickCurrent = pick === null ? after.length === 0 : after.includes(pick);
  return { next: pick !== null && after.includes(pick) ? pick : (after[0] ?? null), pickCurrent };
}

const rulesOutcome = (ctx: TurnContext, over: Partial<TurnOutcome> = {}): TurnOutcome => ({
  proposals: ctx.baseline,
  rejected: [],
  pick: ctx.candidates[0]?.question.id ?? null,
  ...settle(ctx, ctx.baseline, ctx.candidates[0]?.question.id ?? null),
  mode: "rules",
  invalid: false,
  fallback: false,
  errorCode: null,
  issues: [],
  latencyMs: null,
  tokensIn: null,
  tokensOut: null,
  costUsd: null,
  rawCount: ctx.baseline.length,
  rawSupported: ctx.baseline.length,
  needsHelp: ctx.baseline.some((p) => p.value === "not_understood"),
  log: null,
  ...over,
});

export async function runTurn(ctx: TurnContext, system: EvalSystem, llm: LlmOpts | null): Promise<TurnOutcome> {
  if (system === "baseline_rules" || !llm) return rulesOutcome(ctx);
  const t0 = performance.now();
  const base = { provider: llm.provider.provider, model: llm.model ?? null };
  const fail = (code: string, status: "invalid" | "timeout" | "error" | "unavailable", issues: Issue[], raw?: unknown): TurnOutcome => {
    const latency = Math.round(performance.now() - t0);
    return rulesOutcome(ctx, {
      mode: "fallback", fallback: true, invalid: status === "invalid", errorCode: code, issues, latencyMs: latency,
      log: { ...base, mode: "fallback", status, error_code: code, reason_code: null, request: ctx.request, response: raw === undefined ? undefined : raw, validation: { issues }, fallback_reason: code, latency_ms: latency, tokens_in: null, tokens_out: null, cost_usd: null },
    });
  };
  let res;
  try {
    res = await withTimeout(llm.provider.interview(ctx.request, { timeoutMs: llm.timeoutMs, model: llm.model, promptVersion: llm.promptVersion }), llm.timeoutMs);
  } catch (e) {
    if (e instanceof ProviderError) {
      const status = e.code === "timeout" ? "timeout" : e.code === "unavailable" ? "unavailable" : e.code === "invalid" ? "invalid" : "error";
      return fail(e.code, status, [{ code: e.code, detail: e.message.slice(0, 160) }]);
    }
    return fail("error", "error", [{ code: "error", detail: e instanceof Error ? e.message.slice(0, 160) : "kesalahan tak dikenal" }]);
  }
  const latency = Math.round(performance.now() - t0);
  const v = validateInterviewOutput(ctx.request, res.output);
  if (!v.ok) {
    const o = fail("invalid_output", "invalid", v.issues, res.output);
    o.latencyMs = latency;
    if (o.log) { o.log.latency_ms = latency; o.log.tokens_in = res.usage.tokens_in ?? null; o.log.tokens_out = res.usage.tokens_out ?? null; o.log.cost_usd = res.usage.cost_usd ?? null; o.log.model = res.model ?? llm.model ?? null; }
    o.tokensIn = res.usage.tokens_in ?? null; o.tokensOut = res.usage.tokens_out ?? null; o.costUsd = res.usage.cost_usd ?? null;
    return o;
  }
  return {
    proposals: v.proposals,
    rejected: v.rejected,
    pick: v.output.proposed_next_question_id,
    ...settle(ctx, v.proposals, v.output.proposed_next_question_id),
    mode: llm.mode,
    invalid: false,
    fallback: false,
    errorCode: null,
    issues: v.suggestionDropped ? [{ code: "suggestion_dropped", detail: "saran kalimat berisi istilah terlarang dan dibuang" }] : [],
    latencyMs: latency,
    tokensIn: res.usage.tokens_in ?? null,
    tokensOut: res.usage.tokens_out ?? null,
    costUsd: res.usage.cost_usd ?? null,
    rawCount: v.rawCount,
    rawSupported: v.rawSupported,
    needsHelp: v.output.needs_human_help,
    log: {
      ...base, model: res.model ?? llm.model ?? null, mode: llm.mode, status: "ok", error_code: null, reason_code: v.output.selection_reason_code, request: ctx.request, response: res.output,
      validation: { rejected: v.rejected, suggestion_dropped: v.suggestionDropped }, fallback_reason: null, latency_ms: latency, tokens_in: res.usage.tokens_in ?? null, tokens_out: res.usage.tokens_out ?? null, cost_usd: res.usage.cost_usd ?? null,
    },
  };
}

export interface SessionTrace {
  turns: number;
  finished: boolean;
  coverage: number | null;
  asked: string[];
  facts: Record<string, string>;
  outcomes: TurnOutcome[];
  staleNext: number;
  proposedAskedIds: number;
}

const MAX_SESSION_TURNS = 14;

/** Memutar satu sesi dari awal memakai jawaban bebas berskrip. Pertanyaan tanpa skrip dijawab "saya tidak tahu". */
export async function runSession(bank: Bank, caseId: string, input: SessionInput, system: EvalSystem, llm: LlmOpts | null, budgets: Budgets, runKey = "eval", onTurn?: (o: TurnOutcome, ctx: TurnContext, turnNo: number) => void): Promise<SessionTrace> {
  const facts: Record<string, string> = {};
  const asked: string[] = [];
  const outcomes: TurnOutcome[] = [];
  let staleNext = 0, proposedAskedIds = 0;
  let { agenda } = agendaFor(bank, input.stage, input.indicators, input.scope_tags, input.episode_context, facts, asked, budgets);
  let qid: string | null = agenda.eligible[0]?.question.id ?? null;
  let turn = 0;
  while (qid && turn < MAX_SESSION_TURNS) {
    turn++;
    const answer = input.script[qid] ?? "saya tidak tahu";
    const confirmed = Object.entries(facts).map(([slot, value]) => ({ slot, value }));
    const ctx = buildTurnContext(bank, caseId, input.stage, { indicators: input.indicators, scope_tags: input.scope_tags, episode_context: input.episode_context, confirmed_facts: confirmed, asked_question_ids: asked, last_turn: { question_id: qid, answer_text: answer } }, budgets, turn, runKey);
    const out = await runTurn(ctx, system, llm);
    outcomes.push(out);
    onTurn?.(out, ctx, turn);
    asked.push(qid);
    for (const p of out.proposals) facts[p.slot] = p.value;
    if (out.pick && asked.includes(out.pick)) proposedAskedIds++;
    if (!out.pickCurrent) staleNext++;
    ({ agenda } = agendaFor(bank, input.stage, input.indicators, input.scope_tags, input.episode_context, facts, asked, budgets));
    qid = out.next;
  }
  const cov = agenda.coverage;
  return { turns: turn, finished: agenda.finished, coverage: cov.required > 0 ? cov.answered / cov.required : null, asked, facts, outcomes, staleNext, proposedAskedIds };
}
