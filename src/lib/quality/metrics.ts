import type Database from "better-sqlite3";
import { assertCan, type Principal } from "../auth/principal";
import { nowIso } from "../clock";
import { addDays } from "../dates";
import { json } from "../db";
import { evalRule, unknownFields } from "../standards/applicability";
import { loadBank } from "../standards/registry";
import type { IndicatorVersionRow } from "../standards/types";
import { factsToRuleContext, isMetaValue } from "../survey/engine";
import { GAP_RULES, MIN_VALID_RESPONSES, SATISFACTION_SLOT, gapRuleOf, type GapRule } from "./definitions";
import { daysBetween, intervalsOverlap, mean, median, percentile, wilson, type Interval } from "./stats";

/* Dasbor mutu: seluruh angka dihitung dari tabel yang sama dengan modul lain (sesi, jawaban, temuan, klarifikasi, tindakan, tindak lanjut).
   Tidak ada angka tersimpan atau dekoratif: setiap pemanggilan menghitung ulang, sehingga dasbor mengikuti data setelah survei, klarifikasi, tindakan, dan tindak lanjut.
   Prinsip yang dijaga di sini: unknown/tidak paham/tidak berlaku/tidak ditanya/tidak merespons selalu terpisah (I3); kepuasan tidak pernah dibaca oleh gap (I4); rutin dan terarah dipisah. */

export type SurveyMode = "routine" | "directed";
export type CareType = "outpatient" | "inpatient";
export type RoutineStage = "pre" | "intra" | "post";

export interface QualityFilters {
  from?: string | null; // YYYY-MM
  to?: string | null; // YYYY-MM
  facilityId?: string | null;
  careType?: CareType | null;
  stage?: RoutineStage | null;
  mode: SurveyMode;
  indicatorId?: string | null;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Menormalkan masukan mentah (query string) menjadi filter sah; nilai tak dikenal dibuang. */
export function normalizeFilters(raw: Record<string, string | string[] | undefined>): QualityFilters {
  const one = (k: string) => {
    const v = raw[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || null;
  };
  const from = one("from");
  const to = one("to");
  const care = one("care");
  const stage = one("stage");
  const mode = one("mode");
  return {
    from: from && MONTH.test(from) ? from : null,
    to: to && MONTH.test(to) ? to : null,
    facilityId: one("facility")?.slice(0, 40) ?? null,
    careType: care === "outpatient" || care === "inpatient" ? care : null,
    stage: stage === "pre" || stage === "intra" || stage === "post" ? stage : null,
    mode: mode === "directed" ? "directed" : "routine",
    indicatorId: one("indicator")?.slice(0, 60) ?? null,
  };
}

const ym = (iso: string | null | undefined) => (iso ? iso.slice(0, 7) : "");
const inPeriod = (iso: string | null | undefined, f: Pick<QualityFilters, "from" | "to">) => {
  const m = ym(iso);
  if (!m) return !f.from && !f.to;
  return (!f.from || m >= f.from) && (!f.to || m <= f.to);
};

/* ---------- Sesi dan observasi ---------- */
export type ObsCategory = "negative" | "positive" | "unknown" | "not_applicable" | "not_asked" | "nonresponse" | "in_progress";

interface SessionRow {
  id: string;
  facility_id: string;
  stage: string;
  mode: string;
  status: string;
  respondent_role: string;
  at: string;
  period: string;
  care_type: CareType;
  peer_group: string | null;
  indicators: string[];
  context: Record<string, string | number | boolean | null>;
  facts: Map<string, string>; // slot → nilai aktif (tanpa subjek)
  factsBySubject: { slot: string; subject: string | null; value: string }[];
}

export interface Observation {
  session_id: string;
  indicator_version_id: string;
  indicator_id: string;
  facility_id: string;
  peer_group: string | null;
  care_type: CareType;
  stage: string;
  period: string;
  at: string;
  category: ObsCategory;
  companion: boolean;
}

function loadSessions(db: Database.Database, f: Pick<QualityFilters, "mode" | "facilityId">): SessionRow[] {
  const params: unknown[] = [f.mode];
  let where = "s.is_sandbox = 0 AND s.mode = ?";
  if (f.facilityId) {
    where += " AND s.facility_id = ?";
    params.push(f.facilityId);
  }
  const rows = db
    .prepare(
      `SELECT s.id, s.facility_id, s.stage, s.mode, s.status, s.respondent_role, s.indicator_versions_json,
              COALESCE(s.started_at, s.deadline_at, s.last_activity_at, e.discharge_at) AS at, e.care_type, e.context_json, fa.peer_group
       FROM survey_sessions s JOIN episodes e ON e.id = s.episode_id LEFT JOIN facilities fa ON fa.id = s.facility_id WHERE ${where}`,
    )
    .all(...params) as (Omit<SessionRow, "indicators" | "context" | "facts" | "factsBySubject" | "period"> & { indicator_versions_json: string; context_json: string })[];
  if (!rows.length) return [];
  const facts = db
    .prepare("SELECT f.session_id, f.slot, f.subject, f.value FROM participant_facts f JOIN survey_sessions s ON s.id = f.session_id WHERE f.status = 'active' AND s.is_sandbox = 0 AND s.mode = ? ORDER BY f.created_at, f.rowid")
    .all(f.mode) as { session_id: string; slot: string; subject: string | null; value: string }[];
  const bySession = new Map<string, typeof facts>();
  for (const x of facts) {
    const arr = bySession.get(x.session_id) ?? [];
    arr.push(x);
    bySession.set(x.session_id, arr);
  }
  return rows.map((r) => {
    const fs = bySession.get(r.id) ?? [];
    const map = new Map<string, string>();
    for (const x of fs) if (!x.subject) map.set(x.slot, x.value);
    return {
      id: r.id, facility_id: r.facility_id, stage: r.stage, mode: r.mode, status: r.status, respondent_role: r.respondent_role, at: r.at, period: ym(r.at), care_type: r.care_type, peer_group: r.peer_group,
      indicators: json<string[]>(r.indicator_versions_json, []), context: json(r.context_json, {}), facts: map, factsBySubject: fs.map((x) => ({ slot: x.slot, subject: x.subject, value: x.value })),
    };
  });
}

function applySessionFilters(rows: SessionRow[], f: QualityFilters): SessionRow[] {
  return rows.filter((s) => inPeriod(s.at, f) && (!f.careType || s.care_type === f.careType) && (!f.stage || s.stage === f.stage));
}

function categorize(rule: GapRule, ind: IndicatorVersionRow, s: SessionRow): ObsCategory {
  const v = s.facts.get(rule.slot);
  if (v !== undefined) {
    if (rule.negative.includes(v)) return "negative";
    if (rule.positive.includes(v)) return "positive";
    if (v === "not_applicable") return "not_applicable";
    return "unknown"; // unknown, not_understood, atau nilai di luar kamus: tidak terbaca sebagai gap (I3)
  }
  if (rule.requires) {
    const r = s.facts.get(rule.requires.slot);
    if (r !== undefined) {
      if (rule.requires.na_values.includes(r)) return "not_applicable";
      if (isMetaValue(r)) return "unknown";
    }
  }
  const ctx = factsToRuleContext(s.context, Object.fromEntries(s.facts));
  const app = evalRule(ind.applicability, ctx);
  if (app === "no") return "not_applicable";
  if (app === "unknown" && unknownFields(ind.applicability, ctx).some((fld) => { const fv = s.facts.get(fld); return fv !== undefined && isMetaValue(fv); })) return "unknown";
  if (s.status === "scheduled" || s.status === "active") return "in_progress";
  if (s.status === "expired" || s.status === "cancelled") return "nonresponse";
  return "not_asked";
}

/** Satu observasi per (sesi rutin, indikator yang berlaku untuk sesi itu). Indikator tanpa aturan gap dilewati. */
export function buildObservations(sessions: SessionRow[], indicators: IndicatorVersionRow[]): Observation[] {
  const byVersion = new Map(indicators.map((i) => [i.id, i]));
  const byId = new Map<string, IndicatorVersionRow[]>();
  for (const i of indicators) byId.set(i.indicator_id, [...(byId.get(i.indicator_id) ?? []), i]);
  const out: Observation[] = [];
  for (const s of sessions) {
    if (s.mode !== "routine") continue;
    const seen = new Set<string>();
    const candidates: IndicatorVersionRow[] = [];
    for (const vid of s.indicators) {
      const ind = byVersion.get(vid) ?? byId.get(vid.split(":")[0])?.[0];
      if (ind && !seen.has(ind.id)) { seen.add(ind.id); candidates.push(ind); }
    }
    // indikator yang jawabannya ada walau tidak tercantum pada daftar sesi (mis. impor) tetap dihitung
    for (const r of GAP_RULES) {
      if (s.facts.has(r.slot)) {
        const ind = byId.get(r.indicator_id)?.find((i) => i.stage === s.stage) ?? byId.get(r.indicator_id)?.[0];
        if (ind && !seen.has(ind.id)) { seen.add(ind.id); candidates.push(ind); }
      }
    }
    for (const ind of candidates) {
      const rule = gapRuleOf(ind.indicator_id);
      if (!rule) continue;
      out.push({
        session_id: s.id, indicator_version_id: ind.id, indicator_id: ind.indicator_id, facility_id: s.facility_id, peer_group: s.peer_group, care_type: s.care_type, stage: s.stage,
        period: s.period, at: s.at, category: categorize(rule, ind, s), companion: s.respondent_role === "companion",
      });
    }
  }
  return out;
}

/* ---------- Agregasi gap ---------- */
export interface GapRow {
  key: string;
  label: string;
  eligible: number;
  negative: number;
  positive: number;
  unknown: number;
  not_applicable: number;
  not_asked: number;
  nonresponse: number;
  in_progress: number;
  n_valid: number;
  gap: number | null;
  ci: Interval | null;
  /** Jawaban terbaca (sah + tidak tahu) ÷ sesi memenuhi syarat yang berlaku dan sudah selesai. */
  coverage: number | null;
  sufficient: boolean;
}

export function aggregate(obs: Observation[], keyOf: (o: Observation) => string, labelOf: (key: string, sample: Observation) => string): GapRow[] {
  const groups = new Map<string, { sample: Observation; list: Observation[] }>();
  for (const o of obs) {
    const k = keyOf(o);
    const g = groups.get(k);
    if (g) g.list.push(o);
    else groups.set(k, { sample: o, list: [o] });
  }
  return [...groups.entries()].map(([key, g]) => toRow(key, labelOf(key, g.sample), g.list));
}

export function toRow(key: string, label: string, list: Pick<Observation, "category">[]): GapRow {
  const c = { negative: 0, positive: 0, unknown: 0, not_applicable: 0, not_asked: 0, nonresponse: 0, in_progress: 0 };
  for (const o of list) c[o.category]++;
  const n_valid = c.negative + c.positive;
  const basis = list.length - c.not_applicable - c.in_progress;
  return {
    key, label, eligible: list.length, ...c, n_valid,
    gap: n_valid > 0 ? c.negative / n_valid : null,
    ci: wilson(c.negative, n_valid),
    coverage: basis > 0 ? (c.negative + c.positive + c.unknown) / basis : null,
    sufficient: n_valid >= MIN_VALID_RESPONSES,
  };
}

/* ---------- Bagian-bagian dasbor ---------- */
export interface IndicatorMeta { id: string; title: string; stage: string; kind: string; version_id: string; rule: GapRule }

export interface QualityOption { id: string; label: string }

export interface DirectedSummary {
  invited: number;
  answered: number;
  yes: number;
  no: number;
  unknown: number;
  nonresponse: number;
  in_progress: number;
  /** Hasil pembuktian temuan yang berasal dari konfirmasi terarah (survey_directed). */
  findings: Record<string, number>;
  by_facility: { facility_id: string; facility: string; answered: number; yes: number; no: number; unknown: number; nonresponse: number }[];
}

export interface Pipeline {
  participant_reports: { gap_answers: number; findings_from_reports: number; service_requests: number };
  machine_signals: { total: number; active: number; by_type: Record<string, number> };
  proof: Record<string, number>;
  causes: { administrative: number; service_process: number; not_analysed: number; escalations_approved: number };
  claim_decisions: { total: number; simulated: number; by_decision: Record<string, number> };
  actions: Record<string, number>;
}

export interface ReportVsVerified {
  indicator_id: string;
  label: string;
  /** Jawaban negatif pada survei rutin (laporan peserta). */
  reports: number;
  findings: number;
  by_proof: Record<string, number>;
  concluded: number;
  verified: number;
  verified_share: number | null;
  ci: Interval | null;
}

export interface TimeStat { label: string; n: number; open: number; median_days: number | null; p90_days: number | null }

export interface ResolutionStats {
  stats: TimeStat[];
  clarification: { answered: number; lapsed: number; sent: number; lapsed_share: number | null };
  confirmation: { resolved: number; still_issue: number; pending: number; resolved_share: number | null };
}

export interface ComplaintStats {
  service_requests: { category: string; total: number; open: number; resolved: number }[];
  service_total: number;
  help: { total: number; open: number; handled: number; median_hours: number | null };
}

export interface BeforeAfter {
  action_id: string;
  facility_id: string;
  facility: string;
  indicator_id: string;
  indicator: string;
  description: string;
  status: string;
  window_before: { from: string; to: string };
  window_after: { from: string; to: string } | null;
  before: GapRow | null;
  after: GapRow | null;
  peers_before: GapRow | null;
  peers_after: GapRow | null;
  verdict: "insufficient" | "distinct_lower" | "distinct_higher" | "indistinct" | "not_resolved";
  delta_points: number | null;
}

export interface Satisfaction { n_valid: number; excluded: number; mean: number | null; low: number; mid: number; high: number }

export interface QualityDashboard {
  filters: QualityFilters;
  generated_at: string;
  min_valid: number;
  options: { periods: string[]; facilities: QualityOption[] };
  sessions: { total: number; by_status: Record<string, number>; companion: number; invitations: { total: number; delivered: number; answered: number; expired: number; response_rate: number | null } };
  indicators: (GapRow & { meta: IndicatorMeta })[];
  by_care_type: { indicator_id: string; label: string; outpatient: GapRow | null; inpatient: GapRow | null }[];
  trend: GapRow[] | null;
  facilities: (GapRow & { peer_group: string | null })[] | null;
  directed: DirectedSummary | null;
  pipeline: Pipeline;
  reports_vs_verified: ReportVsVerified[];
  resolution: ResolutionStats;
  complaints: ComplaintStats;
  before_after: BeforeAfter[];
  satisfaction: Satisfaction;
  rules_missing: string[];
}

function indicatorMetas(db: Database.Database): { metas: Map<string, IndicatorMeta>; indicators: IndicatorVersionRow[]; missing: string[] } {
  const bank = loadBank(db, { allowDraft: true });
  const metas = new Map<string, IndicatorMeta>();
  const missing: string[] = [];
  for (const i of bank.indicators) {
    if (i.indicator_id === "CTX_PROBES" || i.indicator_id === "DIRECTED_SERVICE") continue;
    const rule = gapRuleOf(i.indicator_id);
    if (!rule) { missing.push(i.indicator_id); continue; }
    if (!metas.has(i.indicator_id)) metas.set(i.indicator_id, { id: i.indicator_id, title: i.title, stage: i.stage, kind: i.kind, version_id: i.id, rule });
  }
  return { metas, indicators: bank.indicators, missing };
}

const facilityLabels = (db: Database.Database) => new Map((db.prepare("SELECT id, name, peer_group FROM facilities").all() as { id: string; name: string; peer_group: string | null }[]).map((f) => [f.id, f]));

function directedSummary(db: Database.Database, sessions: SessionRow[], f: QualityFilters, fac: ReturnType<typeof facilityLabels>): DirectedSummary {
  const rows = applySessionFilters(sessions, f);
  const sum: DirectedSummary = { invited: rows.length, answered: 0, yes: 0, no: 0, unknown: 0, nonresponse: 0, in_progress: 0, findings: {}, by_facility: [] };
  const byFac = new Map<string, DirectedSummary["by_facility"][number]>();
  for (const s of rows) {
    const v = s.factsBySubject.find((x) => x.slot === "service_performed")?.value;
    const slot = byFac.get(s.facility_id) ?? { facility_id: s.facility_id, facility: fac.get(s.facility_id)?.name ?? s.facility_id, answered: 0, yes: 0, no: 0, unknown: 0, nonresponse: 0 };
    byFac.set(s.facility_id, slot);
    if (v === undefined) {
      if (s.status === "scheduled" || s.status === "active") sum.in_progress++;
      else { sum.nonresponse++; slot.nonresponse++; }
      continue;
    }
    sum.answered++;
    slot.answered++;
    if (v === "yes") { sum.yes++; slot.yes++; }
    else if (v === "no") { sum.no++; slot.no++; }
    else { sum.unknown++; slot.unknown++; } // 'tidak ingat' BUKAN 'tidak' (I3)
  }
  const fr = db.prepare("SELECT f.proof_status, f.facility_id, f.created_at, e.care_type FROM findings f LEFT JOIN episodes e ON e.id = f.episode_id WHERE f.source = 'survey_directed'").all() as { proof_status: string; facility_id: string; created_at: string; care_type: CareType | null }[];
  for (const x of fr) {
    if (!inPeriod(x.created_at, f) || (f.facilityId && x.facility_id !== f.facilityId) || (f.careType && x.care_type !== f.careType)) continue;
    sum.findings[x.proof_status] = (sum.findings[x.proof_status] ?? 0) + 1;
  }
  sum.by_facility = [...byFac.values()].sort((a, b) => a.facility.localeCompare(b.facility));
  return sum;
}

function pipeline(db: Database.Database, f: QualityFilters, gapAnswers: number): Pipeline {
  const fnd = (db.prepare("SELECT f.id, f.type, f.source, f.proof_status, f.signal_active, f.causes_json, f.facility_id, f.created_at, e.care_type FROM findings f LEFT JOIN episodes e ON e.id = f.episode_id").all() as {
    id: string; type: string; source: string; proof_status: string; signal_active: number; causes_json: string | null; facility_id: string; created_at: string; care_type: CareType | null;
  }[]).filter((x) => inPeriod(x.created_at, f) && (!f.facilityId || x.facility_id === f.facilityId) && (!f.careType || x.care_type === f.careType));
  const report = fnd.filter((x) => x.source === "survey_routine" || x.source === "participant_report");
  const machine = fnd.filter((x) => x.source === "claim_engine" || x.source === "documentation" || x.source === "pending");
  const proof: Record<string, number> = {};
  for (const x of fnd) proof[x.proof_status] = (proof[x.proof_status] ?? 0) + 1;
  const machineByType: Record<string, number> = {};
  for (const x of machine) machineByType[x.type] = (machineByType[x.type] ?? 0) + 1;
  const verified = fnd.filter((x) => x.proof_status === "verified");
  let admin = 0, service = 0, none = 0;
  for (const x of verified) {
    const c = json<string[]>(x.causes_json, []);
    if (!c.length) none++;
    if (c.includes("administrative")) admin++;
    if (c.includes("service_process")) service++;
  }
  const ids = new Set(fnd.map((x) => x.id));
  const decisions = (db.prepare("SELECT finding_id, kind, decision, state, simulated FROM review_decisions WHERE kind IN ('claim_review','fraud_approval')").all() as { finding_id: string | null; kind: string; decision: string | null; state: string; simulated: number }[]).filter((d) => d.finding_id && ids.has(d.finding_id));
  const claim = decisions.filter((d) => d.kind === "claim_review");
  const byDecision: Record<string, number> = {};
  for (const d of claim) byDecision[d.decision ?? "-"] = (byDecision[d.decision ?? "-"] ?? 0) + 1;
  const escalations = decisions.filter((d) => d.kind === "fraud_approval" && d.decision === "approved").length;
  const acts = (db.prepare("SELECT status, facility_id, created_at FROM improvement_actions").all() as { status: string; facility_id: string; created_at: string }[]).filter((a) => inPeriod(a.created_at, f) && (!f.facilityId || a.facility_id === f.facilityId));
  const actions: Record<string, number> = {};
  for (const a of acts) actions[a.status] = (actions[a.status] ?? 0) + 1;
  const sr = (db.prepare("SELECT facility_id, created_at FROM service_requests").all() as { facility_id: string; created_at: string }[]).filter((x) => inPeriod(x.created_at, f) && (!f.facilityId || x.facility_id === f.facilityId)).length;
  return {
    participant_reports: { gap_answers: gapAnswers, findings_from_reports: report.length, service_requests: sr },
    machine_signals: { total: machine.length, active: machine.filter((x) => x.signal_active).length, by_type: machineByType },
    proof,
    causes: { administrative: admin, service_process: service, not_analysed: none, escalations_approved: escalations },
    claim_decisions: { total: claim.length, simulated: claim.filter((d) => d.simulated).length, by_decision: byDecision },
    actions,
  };
}

function reportsVsVerified(db: Database.Database, f: QualityFilters, obs: Observation[], metas: Map<string, IndicatorMeta>): ReportVsVerified[] {
  const fnd = (db.prepare("SELECT f.indicator_id, f.proof_status, f.facility_id, f.created_at, e.care_type FROM findings f LEFT JOIN episodes e ON e.id = f.episode_id WHERE f.indicator_id IS NOT NULL AND f.source IN ('survey_routine','participant_report')").all() as {
    indicator_id: string; proof_status: string; facility_id: string; created_at: string; care_type: CareType | null;
  }[]).filter((x) => inPeriod(x.created_at, f) && (!f.facilityId || x.facility_id === f.facilityId) && (!f.careType || x.care_type === f.careType));
  const ids = new Set<string>([...obs.filter((o) => o.category === "negative").map((o) => o.indicator_id), ...fnd.map((x) => x.indicator_id)]);
  return [...ids].filter((id) => metas.has(id)).sort().map((id) => {
    const list = fnd.filter((x) => x.indicator_id === id);
    const by: Record<string, number> = {};
    for (const x of list) by[x.proof_status] = (by[x.proof_status] ?? 0) + 1;
    const verified = by.verified ?? 0;
    const concluded = verified + (by.not_verified ?? 0) + (by.inconclusive ?? 0);
    return {
      indicator_id: id, label: metas.get(id)?.title ?? id, reports: obs.filter((o) => o.indicator_id === id && o.category === "negative").length, findings: list.length, by_proof: by, concluded, verified,
      verified_share: concluded > 0 ? verified / concluded : null, ci: wilson(verified, concluded),
    };
  });
}

function timeStat(label: string, pairs: { start: string; end: string | null }[]): TimeStat {
  const done = pairs.filter((p) => p.end).map((p) => daysBetween(p.start, p.end as string)).filter((d) => d >= 0);
  return { label, n: done.length, open: pairs.filter((p) => !p.end).length, median_days: median(done), p90_days: percentile(done, 0.9) };
}

function resolution(db: Database.Database, f: QualityFilters): ResolutionStats {
  const facOk = (x: string) => !f.facilityId || x === f.facilityId;
  const cases = (db.prepare("SELECT c.facility_id, c.opened_at, c.first_review_at, c.closed_at, e.care_type FROM cases c LEFT JOIN episodes e ON e.id = c.episode_id").all() as { facility_id: string; opened_at: string; first_review_at: string | null; closed_at: string | null; care_type: CareType | null }[])
    .filter((c) => inPeriod(c.opened_at, f) && facOk(c.facility_id) && (!f.careType || c.care_type === f.careType));
  const cl = (db.prepare("SELECT facility_id, status, sent_at, answered_at FROM clarifications").all() as { facility_id: string; status: string; sent_at: string; answered_at: string | null }[]).filter((c) => inPeriod(c.sent_at, f) && facOk(c.facility_id));
  const acts = (db.prepare("SELECT facility_id, created_at, resolved_at, closed_at FROM improvement_actions").all() as { facility_id: string; created_at: string; resolved_at: string | null; closed_at: string | null }[]).filter((a) => inPeriod(a.created_at, f) && facOk(a.facility_id));
  const stats = [
    timeStat("Kasus dibuka hingga tinjauan pertama", cases.map((c) => ({ start: c.opened_at, end: c.first_review_at }))),
    timeStat("Klarifikasi dikirim hingga dijawab faskes", cl.filter((c) => c.status !== "withdrawn").map((c) => ({ start: c.sent_at, end: c.answered_at }))),
    timeStat("Tindakan dibuat hingga selesai dikerjakan", acts.map((a) => ({ start: a.created_at, end: a.resolved_at }))),
    timeStat("Tindakan dibuat hingga ditutup", acts.map((a) => ({ start: a.created_at, end: a.closed_at }))),
  ];
  const answered = cl.filter((c) => c.status === "answered").length;
  const lapsed = cl.filter((c) => c.status === "lapsed").length;
  const fu = (db.prepare("SELECT u.status, u.outcome, a.facility_id, a.created_at FROM follow_ups u JOIN improvement_actions a ON a.id = u.action_id WHERE u.kind = 'participant_confirmation'").all() as { status: string; outcome: string | null; facility_id: string; created_at: string }[])
    .filter((x) => inPeriod(x.created_at, f) && facOk(x.facility_id));
  const resolved = fu.filter((x) => x.outcome === "resolved").length;
  const still = fu.filter((x) => x.outcome === "still_issue").length;
  return {
    stats,
    clarification: { answered, lapsed, sent: cl.filter((c) => c.status === "sent").length, lapsed_share: answered + lapsed > 0 ? lapsed / (answered + lapsed) : null },
    confirmation: { resolved, still_issue: still, pending: fu.filter((x) => x.status === "pending").length, resolved_share: resolved + still > 0 ? resolved / (resolved + still) : null },
  };
}

function complaints(db: Database.Database, f: QualityFilters): ComplaintStats {
  const sr = (db.prepare("SELECT category, status, facility_id, created_at FROM service_requests").all() as { category: string; status: string; facility_id: string; created_at: string }[]).filter((x) => inPeriod(x.created_at, f) && (!f.facilityId || x.facility_id === f.facilityId));
  const cats = new Map<string, { category: string; total: number; open: number; resolved: number }>();
  for (const x of sr) {
    const c = cats.get(x.category) ?? { category: x.category, total: 0, open: 0, resolved: 0 };
    c.total++;
    if (x.status === "resolved" || x.status === "closed") c.resolved++;
    else c.open++;
    cats.set(x.category, c);
  }
  const help = (db.prepare("SELECT h.status, h.created_at, h.handled_at, e.facility_id FROM help_requests h LEFT JOIN episodes e ON e.id = h.episode_id").all() as { status: string; created_at: string; handled_at: string | null; facility_id: string | null }[])
    .filter((x) => inPeriod(x.created_at, f) && (!f.facilityId || x.facility_id === f.facilityId));
  const hours = help.filter((h) => h.handled_at).map((h) => daysBetween(h.created_at, h.handled_at as string) * 24).filter((h) => h >= 0);
  return {
    service_requests: [...cats.values()].sort((a, b) => b.total - a.total),
    service_total: sr.length,
    help: { total: help.length, open: help.filter((h) => h.status === "open").length, handled: help.filter((h) => h.status === "handled").length, median_hours: median(hours) },
  };
}

function satisfaction(sessions: SessionRow[]): Satisfaction {
  let excluded = 0;
  const scores: number[] = [];
  for (const s of sessions) {
    const v = s.facts.get(SATISFACTION_SLOT);
    if (v === undefined) continue;
    const n = Number(v);
    if (!/^\d{1,2}$/.test(v) || !Number.isInteger(n) || n < 0 || n > 10) { excluded++; continue; }
    scores.push(n);
  }
  return { n_valid: scores.length, excluded, mean: mean(scores), low: scores.filter((x) => x <= 4).length, mid: scores.filter((x) => x >= 5 && x <= 7).length, high: scores.filter((x) => x >= 8).length };
}

const WINDOW_BEFORE_DAYS = 90;

function beforeAfter(db: Database.Database, allObs: Observation[], metas: Map<string, IndicatorMeta>, f: QualityFilters, fac: ReturnType<typeof facilityLabels>): BeforeAfter[] {
  const acts = db.prepare("SELECT id, facility_id, indicator_id, description, status, created_at, resolved_at, closed_at FROM improvement_actions WHERE indicator_id IS NOT NULL ORDER BY created_at, id").all() as {
    id: string; facility_id: string; indicator_id: string; description: string; status: string; created_at: string; resolved_at: string | null; closed_at: string | null;
  }[];
  const now = nowIso();
  const out: BeforeAfter[] = [];
  for (const a of acts) {
    if (f.facilityId && a.facility_id !== f.facilityId) continue;
    const meta = metas.get(a.indicator_id);
    if (!meta) continue;
    const peer = fac.get(a.facility_id)?.peer_group ?? null;
    const bFrom = addDays(a.created_at, -WINDOW_BEFORE_DAYS).slice(0, 10);
    const bTo = a.created_at.slice(0, 10);
    const aFrom = a.resolved_at ? a.resolved_at.slice(0, 10) : null;
    const aTo = now.slice(0, 10);
    const sel = (facilityOnly: boolean, from: string, to: string) =>
      allObs.filter((o) => o.indicator_id === a.indicator_id && (facilityOnly ? o.facility_id === a.facility_id : o.facility_id !== a.facility_id && !!peer && o.peer_group === peer) && o.at.slice(0, 10) >= from && o.at.slice(0, 10) < to);
    const mk = (list: Observation[], key: string) => (list.length ? toRow(key, key, list) : null);
    const before = mk(sel(true, bFrom, bTo), "before");
    const after = aFrom ? mk(sel(true, aFrom, addDays(aTo, 1).slice(0, 10)), "after") : null;
    let verdict: BeforeAfter["verdict"] = "not_resolved";
    let delta: number | null = null;
    if (aFrom) {
      if (!before || !after || before.n_valid < MIN_VALID_RESPONSES || after.n_valid < MIN_VALID_RESPONSES || before.gap === null || after.gap === null) verdict = "insufficient";
      else {
        delta = (after.gap - before.gap) * 100;
        verdict = intervalsOverlap(before.ci, after.ci) ? "indistinct" : after.gap < before.gap ? "distinct_lower" : "distinct_higher";
      }
    }
    out.push({
      action_id: a.id, facility_id: a.facility_id, facility: fac.get(a.facility_id)?.name ?? a.facility_id, indicator_id: a.indicator_id, indicator: meta.title, description: a.description, status: a.status,
      window_before: { from: bFrom, to: bTo }, window_after: aFrom ? { from: aFrom, to: aTo } : null, before, after,
      peers_before: mk(sel(false, bFrom, bTo), "peers_before"), peers_after: aFrom ? mk(sel(false, aFrom, addDays(aTo, 1).slice(0, 10)), "peers_after") : null, verdict, delta_points: delta,
    });
  }
  return out;
}

/** Ringkasan sesi dan undangan untuk filter yang sama. */
function sessionSummary(db: Database.Database, rows: SessionRow[], f: QualityFilters) {
  const by: Record<string, number> = {};
  for (const s of rows) by[s.status] = (by[s.status] ?? 0) + 1;
  const inv = (db.prepare("SELECT i.status, i.mode, i.stage, i.facility_id, i.at, i.care_type FROM (SELECT i.status, i.mode, i.stage, e.facility_id, COALESCE(i.sent_at, i.scheduled_for, i.created_at) AS at, e.care_type FROM invitations i JOIN episodes e ON e.id = i.episode_id) i").all() as {
    status: string; mode: string; stage: string; facility_id: string; at: string; care_type: CareType;
  }[]).filter((i) => i.mode === f.mode && inPeriod(i.at, f) && (!f.facilityId || i.facility_id === f.facilityId) && (!f.careType || i.care_type === f.careType) && (!f.stage || i.stage === f.stage));
  const delivered = inv.filter((i) => ["sent", "opened", "answered", "expired"].includes(i.status)).length;
  const answered = inv.filter((i) => i.status === "answered").length;
  return {
    total: rows.length,
    by_status: by,
    companion: rows.filter((s) => s.respondent_role === "companion").length,
    invitations: { total: inv.length, delivered, answered, expired: inv.filter((i) => i.status === "expired").length, response_rate: delivered > 0 ? answered / delivered : null },
  };
}

export function qualityOptions(db: Database.Database) {
  const months = new Set<string>();
  for (const r of db.prepare("SELECT COALESCE(s.started_at, s.deadline_at, s.last_activity_at, e.discharge_at) AS at FROM survey_sessions s JOIN episodes e ON e.id = s.episode_id WHERE s.is_sandbox = 0").all() as { at: string }[]) if (r.at) months.add(ym(r.at));
  const facilities = (db.prepare("SELECT id, name FROM facilities ORDER BY name").all() as { id: string; name: string }[]).map((x) => ({ id: x.id, label: x.name }));
  return { periods: [...months].sort(), facilities };
}

/** Penghitung utama. Hanya staf dengan wewenang quality.view; faskes dan peserta ditolak di server. */
export function qualityDashboard(db: Database.Database, p: Principal, filters: QualityFilters): QualityDashboard {
  assertCan(p, "quality.view");
  const f = filters;
  const fac = facilityLabels(db);
  const { metas, indicators, missing } = indicatorMetas(db);
  // sesi rutin dan terarah dimuat terpisah: keduanya tidak pernah dijumlahkan
  const routineAll = loadSessions(db, { mode: "routine", facilityId: f.facilityId });
  const sessionsForMode = f.mode === "routine" ? routineAll : loadSessions(db, { mode: "directed", facilityId: f.facilityId });
  const filtered = applySessionFilters(sessionsForMode, f);
  const obsAll = buildObservations(routineAll, indicators); // tanpa filter periode/jenis: dipakai sebelum/sesudah
  const obs = f.mode === "routine" ? buildObservations(filtered, indicators) : [];
  const obsSel = f.indicatorId ? obs.filter((o) => o.indicator_id === f.indicatorId) : obs;

  const indRows = aggregate(obs, (o) => o.indicator_id, (k) => metas.get(k)?.title ?? k)
    .filter((r) => metas.has(r.key))
    .map((r) => ({ ...r, meta: metas.get(r.key) as IndicatorMeta }))
    .sort((a, b) => stageOrder(a.meta.stage) - stageOrder(b.meta.stage) || a.meta.id.localeCompare(b.meta.id));

  const byCare = [...new Set(obs.map((o) => o.indicator_id))].filter((id) => metas.has(id)).sort().map((id) => {
    const list = obs.filter((o) => o.indicator_id === id);
    const mk = (c: CareType) => { const l = list.filter((o) => o.care_type === c); return l.length ? toRow(c, c, l) : null; };
    return { indicator_id: id, label: metas.get(id)?.title ?? id, outpatient: mk("outpatient"), inpatient: mk("inpatient") };
  });

  const gapAnswers = obs.filter((o) => o.category === "negative").length;
  return {
    filters: f,
    generated_at: nowIso(),
    min_valid: MIN_VALID_RESPONSES,
    options: qualityOptions(db),
    sessions: sessionSummary(db, filtered, f),
    indicators: indRows,
    by_care_type: byCare,
    trend: f.indicatorId && f.mode === "routine" ? aggregate(obsSel, (o) => o.period, (k) => k).sort((a, b) => a.key.localeCompare(b.key)) : null,
    facilities: f.indicatorId && f.mode === "routine"
      ? aggregate(obsSel, (o) => o.facility_id, (k) => fac.get(k)?.name ?? k).map((r) => ({ ...r, peer_group: fac.get(r.key)?.peer_group ?? null })).sort((a, b) => a.label.localeCompare(b.label))
      : null,
    directed: f.mode === "directed" ? directedSummary(db, sessionsForMode, f, fac) : null,
    pipeline: pipeline(db, f, gapAnswers),
    reports_vs_verified: reportsVsVerified(db, f, obs, metas),
    resolution: resolution(db, f),
    complaints: complaints(db, f),
    before_after: beforeAfter(db, obsAll, metas, f, fac),
    satisfaction: satisfaction(applySessionFilters(loadSessions(db, { mode: "routine", facilityId: f.facilityId }), f)),
    rules_missing: missing,
  };
}

const stageOrder = (s: string) => ({ pre: 0, intra: 1, post: 2 } as Record<string, number>)[s] ?? 9;

/** CSV tabel indikator (untuk ekspor). Nilai teks di-escape; tidak memuat data pribadi. */
export function indicatorCsv(d: QualityDashboard): string {
  const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ["indikator_id", "indikator", "tahap", "memenuhi_syarat", "jawaban_negatif", "jawaban_positif", "n_sah", "gap", "gap_bawah_95", "gap_atas_95", "tidak_tahu", "tidak_berlaku", "tidak_ditanya", "tidak_merespons", "masih_berjalan", "cakupan", "n_cukup"];
  const lines = [head.join(",")];
  for (const r of d.indicators) {
    lines.push([r.meta.id, r.meta.title, r.meta.stage, r.eligible, r.negative, r.positive, r.n_valid, r.gap?.toFixed(4) ?? "", r.ci?.lo.toFixed(4) ?? "", r.ci?.hi.toFixed(4) ?? "", r.unknown, r.not_applicable, r.not_asked, r.nonresponse, r.in_progress, r.coverage?.toFixed(4) ?? "", r.sufficient ? "ya" : "tidak"].map(esc).join(","));
  }
  return lines.join("\n") + "\n";
}
