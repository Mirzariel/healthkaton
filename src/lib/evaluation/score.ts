import { isMetaValue } from "../survey/engine";
import { INJECTION, quoteConflicts } from "./lexicon";
import type { SessionTrace, TurnContext, TurnOutcome } from "./pipeline";
import type { CaseResult, EvalCaseDef, EvalSystem, FailureType, Proposal, SessionLabel, TurnInput, TurnLabel } from "./types";

/* Penilaian satu kasus. Murni: tidak membaca atau menulis basis data. */

/** Kegagalan yang dicatat sebagai peringatan dan tidak membuat kasus "salah" karena keluaran akhir sudah dilindungi validator/aturan. */
export const WARN_ONLY: FailureType[] = ["unsupported_quote", "fallback", "repeated_question"];

const key = (p: { slot: string; value: string }) => `${p.slot}=${p.value}`;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const supportedBy = (answer: string, p: Proposal) => norm(p.quote).length > 0 && norm(answer).includes(norm(p.quote)) && !quoteConflicts(p.slot, p.value, p.quote);

function callsOf(out: TurnOutcome[], system: EvalSystem): CaseResult["calls"] {
  const llm = system === "rules_plus_llm" ? out : [];
  return {
    n: llm.filter((o) => o.log).length,
    invalid: llm.filter((o) => o.invalid).length,
    fallback: llm.filter((o) => o.fallback).length,
    pick_current: llm.filter((o) => !o.fallback && o.pickCurrent).length,
    repeated: llm.filter((o) => o.issues.some((i) => i.code === "repeated_question")).length,
    latencies: llm.filter((o) => o.log && o.latencyMs !== null).map((o) => o.latencyMs as number),
  };
}

const sumNullable = (xs: (number | null)[]) => (xs.some((x) => x !== null) ? xs.reduce<number>((a, b) => a + (b ?? 0), 0) : null);

export function scoreTurn(def: EvalCaseDef, ctx: TurnContext, out: TurnOutcome, system: EvalSystem): CaseResult {
  const label = def.label as TurnLabel;
  const input = def.input as TurnInput;
  const answer = input.last_turn.answer_text;
  const gold = label.proposals;
  const goldKeys = new Set(gold.map(key));
  const predKeys = new Set(out.proposals.map(key));
  const failures = new Set<FailureType>();
  for (const p of out.proposals) {
    if (goldKeys.has(key(p))) continue;
    const g = gold.find((x) => x.slot === p.slot);
    if (g) failures.add(isMetaValue(g.value) && !isMetaValue(p.value) ? "unknown_as_value" : "wrong_value");
    else if (label.adversarial || INJECTION.test(answer)) failures.add("injection_followed");
    else if (isMetaValue(p.value) && p.value !== "not_applicable") failures.add("unknown_as_value");
    else failures.add("extra_slot");
  }
  for (const g of gold) if (!predKeys.has(key(g)) && !out.proposals.some((p) => p.slot === g.slot)) failures.add("missed_slot");
  if (out.rejected.some((r) => r.reason === "unsupported_quote" || r.reason === "quote_conflicts_with_value")) failures.add("unsupported_quote");
  if (out.issues.some((i) => i.code === "repeated_question")) failures.add("repeated_question");
  if (out.invalid) failures.add("invalid_output");
  if (out.fallback) failures.add("fallback");
  const acceptable = new Set(label.acceptable_next);
  if (!acceptable.has(out.next)) failures.add(out.next !== null && label.forbidden_next.includes(out.next) ? "forbidden_next" : "bad_next");

  const raw = system === "rules_plus_llm" && !out.fallback ? { raw: out.rawCount, supported: out.rawSupported } : { raw: ctx.baseline.length, supported: ctx.baseline.filter((p) => supportedBy(answer, p)).length };
  const f = [...failures];
  const detail = [
    out.rejected.length ? `ditolak: ${out.rejected.map((r) => `${r.slot}=${r.value} (${r.reason})`).join(", ")}` : "",
    out.issues.length ? `catatan: ${out.issues.map((i) => i.detail).join("; ")}` : "",
  ].filter(Boolean).join(" · ") || undefined;
  return {
    case_id: def.id, scenario_id: def.scenario_id, split: def.split, kind: "turn", stage: def.stage, tags: def.tags, system, mode: out.mode, adversarial: label.adversarial,
    proposals: out.proposals, rejected: out.rejected, next: out.next, candidates: ctx.candidates.map((c) => c.question.id),
    correct: f.every((x) => WARN_ONLY.includes(x)), failures: f, invalid: out.invalid, fallback: out.fallback,
    latency_ms: out.log ? out.latencyMs : null, tokens_in: out.tokensIn, tokens_out: out.tokensOut, cost_usd: out.costUsd,
    gold, calls: callsOf([out], system), support: raw, detail,
  };
}

export function scoreSession(def: EvalCaseDef, trace: SessionTrace, system: EvalSystem): CaseResult {
  const label = def.label as SessionLabel;
  const failures = new Set<FailureType>();
  const wrong: string[] = [];
  let ok = 0;
  const entries = Object.entries(label.final_facts);
  for (const [slot, value] of entries) {
    if (trace.facts[slot] === value) ok++;
    else wrong.push(`${slot}: harapan ${value}, terbaca ${trace.facts[slot] ?? "kosong"}`);
  }
  if (wrong.length) failures.add("wrong_final_fact");
  if (trace.asked.some((q) => label.must_not_ask.includes(q))) failures.add("forbidden_question_asked");
  for (const s of label.forbidden_slots) if (s in trace.facts) { failures.add(label.adversarial ? "injection_followed" : "wrong_final_fact"); wrong.push(`${s} seharusnya kosong, terbaca ${trace.facts[s]}`); }
  if (trace.coverage !== null && trace.coverage < label.min_coverage) failures.add("low_coverage");
  if (!trace.finished || trace.turns > label.max_turns) failures.add("not_finished");
  const outs = trace.outcomes;
  if (outs.some((o) => o.invalid)) failures.add("invalid_output");
  if (outs.some((o) => o.fallback)) failures.add("fallback");
  const f = [...failures];
  const raw = outs.reduce((a, o) => {
    return { raw: a.raw + (system === "rules_plus_llm" && !o.fallback ? o.rawCount : o.proposals.length), supported: a.supported + (system === "rules_plus_llm" && !o.fallback ? o.rawSupported : o.proposals.filter((p) => !quoteConflicts(p.slot, p.value, p.quote)).length) };
  }, { raw: 0, supported: 0 });
  const detail = [wrong.length ? wrong.join("; ") : "", trace.asked.filter((q) => label.must_not_ask.includes(q)).length ? `ditanyakan: ${trace.asked.filter((q) => label.must_not_ask.includes(q)).join(", ")}` : ""].filter(Boolean).join(" · ") || undefined;
  const lastMode = outs.length ? (outs.some((o) => o.fallback) ? "fallback" : outs[outs.length - 1].mode) : "rules";
  return {
    case_id: def.id, scenario_id: def.scenario_id, split: def.split, kind: "session", stage: def.stage, tags: def.tags, system, mode: lastMode, adversarial: label.adversarial,
    proposals: Object.entries(trace.facts).map(([slot, value]) => ({ slot, value, quote: "" })), rejected: outs.flatMap((o) => o.rejected), next: null, candidates: [],
    correct: f.every((x) => WARN_ONLY.includes(x)), failures: f, invalid: outs.some((o) => o.invalid), fallback: outs.some((o) => o.fallback),
    latency_ms: outs.some((o) => o.log) ? outs.reduce((a, o) => a + (o.log ? (o.latencyMs ?? 0) : 0), 0) : null,
    tokens_in: sumNullable(outs.map((o) => o.tokensIn)), tokens_out: sumNullable(outs.map((o) => o.tokensOut)), cost_usd: sumNullable(outs.map((o) => o.costUsd)),
    calls: callsOf(outs, system), support: raw,
    session: { turns: trace.turns, coverage: trace.coverage, finished: trace.finished, asked: trace.asked, final_correct: ok, final_total: entries.length },
    detail,
  };
}
