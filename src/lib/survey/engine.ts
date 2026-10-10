import { evalRule, unknownFields, type RuleContext, type Tri } from "../standards/applicability";
import type { CompareOp, ConditionalRule, IndicatorVersionRow, QuestionRow, StageKey } from "../standards/types";

/* Mesin agenda survei (murni, tanpa I/O). Aturan menentukan kewajiban dan cakupan;
   model AI hanya membantu memahami bahasa dan memilih di antara kandidat yang SUDAH diizinkan aturan. */

export const PROBE_INDICATOR = "CTX_PROBES";
export const META_VALUES = ["unknown", "not_understood", "not_applicable"] as const;
export const isMetaValue = (v: string) => (META_VALUES as readonly string[]).includes(v);

export type SlotStatus = "answered" | "unknown" | "not_applicable" | "unresolved";

export interface AgendaInput {
  stage: StageKey;
  indicators: IndicatorVersionRow[];
  questions: QuestionRow[];
  scopeTags: string[];
  /** Konteks episode (boolean/string/null), mis. lab_performed, discharge_prescription_expected. */
  context: RuleContext;
  /** Fakta aktif peserta: kunci slot (atau slot@subjek) → nilai. */
  facts: Record<string, string>;
  asked: string[];
  coreAsked: number;
  clarifAsked: number;
  budgetCore: number;
  budgetClarif: number;
  subject?: string | null;
}

export type CandidateKind = "prerequisite" | "clarification" | "core";
export interface Candidate {
  question: QuestionRow;
  indicator: IndicatorVersionRow;
  kind: CandidateKind;
  reason: string;
}

export interface SlotView {
  indicator_version_id: string;
  indicator_id: string;
  slot: string;
  required_by: "base" | "branch";
  status: SlotStatus;
  value: string | null;
}

export interface IndicatorState {
  indicator: IndicatorVersionRow;
  applicability: Tri;
  /** 'skipped_unknown': penentu penerapan dijawab tidak tahu → tidak ditanya lebih lanjut. */
  state: "applicable" | "not_applicable" | "blocked" | "skipped_unknown";
  blockedOn: string[];
  slots: SlotView[];
}

export interface Agenda {
  indicators: IndicatorState[];
  candidates: Candidate[];
  eligible: Candidate[];
  overBudget: Candidate[];
  coverage: { required: number; answered: number; unknown: number; unresolved: number; not_applicable_indicators: number; may_grow: boolean };
  finished: boolean;
  endStatus: "completed" | "partial" | null;
  endReason: string | null;
}

export function factsToRuleContext(context: RuleContext, facts: Record<string, string>, subject?: string | null): RuleContext {
  const out: RuleContext = { ...context };
  for (const [k, v] of Object.entries(facts)) {
    const slot = subject && k.endsWith("@" + subject) ? k.slice(0, -(subject.length + 1)) : k.includes("@") ? null : k;
    if (!slot) continue;
    out[slot] = v === "yes" ? true : v === "no" ? false : v;
  }
  return out;
}

function condMatches(when: ConditionalRule["when"], facts: Record<string, string>, subject?: string | null): boolean {
  const key = subject ? `${when.slot}@${subject}` : when.slot;
  const v = facts[key] ?? facts[when.slot];
  if (v === undefined || isMetaValue(v)) return false;
  const op: CompareOp = when.operator;
  switch (op) {
    case "eq": return v === when.value;
    case "neq": return v !== when.value;
    case "in": return (when.values ?? []).includes(v);
    case "nin": return !(when.values ?? []).includes(v);
    case "exists": return true;
    default: return false;
  }
}

/** Evaluasi satu syarat cabang terhadap fakta (dipakai juga oleh penghasil sinyal). */
export const conditionHolds = condMatches;

function factFor(facts: Record<string, string>, slot: string, subject?: string | null) {
  return facts[subject ? `${slot}@${subject}` : slot] ?? undefined;
}

export function scopeMatches(indicatorScope: string[], tags: string[]) {
  return indicatorScope.length === 0 || indicatorScope.every((s) => tags.includes(s));
}

export function computeAgenda(inp: AgendaInput): Agenda {
  const ctx = factsToRuleContext(inp.context, inp.facts, inp.subject);
  const probes = inp.questions.filter((q) => q.indicator_version_id.startsWith(PROBE_INDICATOR + ":"));
  const states: IndicatorState[] = [];
  const candidates: Candidate[] = [];
  const askedSet = new Set(inp.asked);

  const inds = inp.indicators
    .filter((i) => i.indicator_id !== PROBE_INDICATOR && i.stage === inp.stage && scopeMatches(i.scope, inp.scopeTags))
    .sort((a, b) => (minOrd(inp.questions, a.id) - minOrd(inp.questions, b.id)) || a.indicator_id.localeCompare(b.indicator_id));

  for (const ind of inds) {
    const app = evalRule(ind.applicability, ctx);
    if (app === "no") {
      states.push({ indicator: ind, applicability: app, state: "not_applicable", blockedOn: [], slots: [] });
      continue;
    }
    if (app === "unknown") {
      const unk = unknownFields(ind.applicability, ctx);
      // penentu berasal dari fakta yang dijawab "tidak tahu" → lewati; bukan hilang
      const answeredUnknown = unk.some((f) => {
        const v = factFor(inp.facts, f, inp.subject);
        return v !== undefined && isMetaValue(v);
      });
      if (answeredUnknown) {
        states.push({ indicator: ind, applicability: app, state: "skipped_unknown", blockedOn: unk, slots: [] });
        continue;
      }
      // penentu adalah bidang konteks yang belum diketahui → cari pertanyaan prasyarat
      for (const f of unk) {
        const probe = probes.find((q) => q.target_slot === f && !askedSet.has(q.id));
        if (probe && !candidates.some((c) => c.question.id === probe.id)) {
          const pi = inp.indicators.find((i) => i.id === probe.indicator_version_id) ?? ind;
          candidates.push({ question: probe, indicator: pi, kind: "prerequisite", reason: "resolve_applicability" });
        }
      }
      states.push({ indicator: ind, applicability: app, state: "blocked", blockedOn: unk, slots: [] });
      continue;
    }
    // berlaku: kumpulkan slot wajib (dasar + cabang yang terpicu)
    const slots: SlotView[] = [];
    const seen = new Set<string>();
    const addSlot = (slot: string, by: "base" | "branch") => {
      if (seen.has(slot)) return;
      seen.add(slot);
      const v = factFor(inp.facts, slot, inp.subject);
      const status: SlotStatus = v === undefined ? "unresolved" : v === "not_applicable" ? "not_applicable" : isMetaValue(v) ? "unknown" : "answered";
      slots.push({ indicator_version_id: ind.id, indicator_id: ind.indicator_id, slot, required_by: by, status, value: v ?? null });
    };
    for (const s of ind.required_slots) addSlot(s, "base");
    // aturan cabang dapat berantai (kondisi bergantung pada slot yang terpicu); iterasi sampai stabil
    for (let pass = 0; pass < 4; pass++) {
      for (const cr of ind.conditional_rules) if (condMatches(cr.when, inp.facts, inp.subject)) for (const s of cr.require) addSlot(s, "branch");
    }
    states.push({ indicator: ind, applicability: app, state: "applicable", blockedOn: [], slots });
    for (const sv of slots.filter((s) => s.status === "unresolved")) {
      const q = inp.questions.find((x) => x.indicator_version_id === ind.id && x.target_slot === sv.slot && !askedSet.has(x.id));
      if (!q) continue;
      const kind: CandidateKind = q.is_core && sv.required_by === "base" ? "core" : "clarification";
      candidates.push({ question: q, indicator: ind, kind, reason: kind === "core" ? "next_core" : "follow_branch" });
    }
  }

  // anggaran
  const withinBudget: Candidate[] = [];
  const overBudget: Candidate[] = [];
  for (const c of candidates) {
    const isClarif = c.kind !== "core";
    const ok = isClarif ? inp.clarifAsked < inp.budgetClarif : inp.coreAsked < inp.budgetCore;
    (ok ? withinBudget : overBudget).push(c);
  }
  const rank: Record<CandidateKind, number> = { prerequisite: 0, clarification: 1, core: 2 };
  withinBudget.sort((a, b) => rank[a.kind] - rank[b.kind] || a.question.ord - b.question.ord);
  const best = withinBudget.length ? rank[withinBudget[0].kind] : null;
  const eligible = best === null ? [] : withinBudget.filter((c) => rank[c.kind] === best);

  let required = 0, answered = 0, unknown = 0, unresolved = 0;
  for (const st of states) for (const s of st.slots) {
    if (s.status === "not_applicable") continue;
    required++;
    if (s.status === "answered") answered++;
    else if (s.status === "unknown") unknown++;
    else unresolved++;
  }
  const mayGrow = states.some((s) => s.state === "blocked") || states.some((s) => s.state === "applicable" && s.indicator.conditional_rules.length > 0);

  const finished = eligible.length === 0;
  let endStatus: Agenda["endStatus"] = null;
  let endReason: string | null = null;
  if (finished) {
    const leftover = unresolved > 0 || overBudget.length > 0 || states.some((s) => s.state === "blocked");
    endStatus = leftover ? "partial" : "completed";
    endReason = leftover ? (overBudget.length > 0 ? "budget_reached" : "unresolved_items") : "coverage_complete";
  }
  return {
    indicators: states,
    candidates,
    eligible,
    overBudget,
    coverage: { required, answered, unknown, unresolved, not_applicable_indicators: states.filter((s) => s.state === "not_applicable").length, may_grow: mayGrow },
    finished,
    endStatus,
    endReason,
  };
}

function minOrd(qs: QuestionRow[], indicatorVersionId: string) {
  const o = qs.filter((q) => q.indicator_version_id === indicatorVersionId).map((q) => q.ord);
  return o.length ? Math.min(...o) : 9999;
}

/** Nilai yang diizinkan untuk satu slot (nilai sah + meta). */
export function allowedValues(indicators: IndicatorVersionRow[], slot: string): string[] | null {
  for (const i of indicators) {
    const s = i.slots.find((x) => x.id === slot);
    if (s) return [...s.values, ...META_VALUES];
  }
  return null;
}

/** Semua slot yang boleh diusulkan AI untuk sesi ini (slot dari indikator yang berlaku atau menunggu). */
export function proposableSlots(agenda: Agenda): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const st of agenda.indicators) {
    if (st.state === "not_applicable" || st.state === "skipped_unknown") continue;
    for (const s of st.indicator.slots) m.set(s.id, [...s.values, ...META_VALUES]);
  }
  return m;
}

export interface SignalHit {
  indicator_version_id: string;
  indicator_id: string;
  category: string;
  note: string;
  slot: string;
  value: string;
}

/** Aturan sinyal berbasis data → permintaan layanan (bukan putusan). */
export function deriveSignalHits(indicators: IndicatorVersionRow[], facts: Record<string, string>, subject?: string | null): SignalHit[] {
  const hits: SignalHit[] = [];
  for (const ind of indicators) {
    for (const sr of ind.signal_rules) {
      const v = factFor(facts, sr.when.slot, subject);
      if (v !== undefined && condMatches(sr.when, facts, subject)) {
        hits.push({ indicator_version_id: ind.id, indicator_id: ind.indicator_id, category: sr.category, note: sr.note, slot: sr.when.slot, value: v });
      }
    }
  }
  return hits;
}
