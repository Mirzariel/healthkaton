import type Database from "better-sqlite3";
import { dayDiff, ts } from "./dates";
import { buildCtx } from "./engine/context";
import { reviewClaim, type CaseState } from "./engine/pipeline";
import { checkServices } from "./engine/stages";
import { loadDataset } from "./db";
import type { Claim, Confirmation, Episode, Evidence, Modus, Participant, Service, ServiceCheck, Stage } from "./types";

export interface CaseRow {
  id: string;
  finding_id: string;
  status: "open" | "clarification" | "decided";
  assignee_role: string | null;
  assignee_note: string | null;
  due_at: string;
  opened_at: string;
  first_review_at: string | null;
  decided_at: string | null;
  decision: string | null;
  decision_reason: string | null;
  correction_amount: number | null;
  modus: Modus;
  score: number;
  severity: "low" | "medium" | "high";
  summary: string;
  claim_id: string;
  claim_no: string;
  amount: number;
  claim_status: string;
  hospital: string;
  episode_id: string;
  participant_id: string;
  participant_name: string;
  dx_text: string;
  dx_code: string;
}

const CASE_SQL = `
SELECT cs.*, f.modus, f.score, f.severity, f.summary, f.claim_id, f.status AS finding_status,
       c.claim_no, c.amount, c.status AS claim_status, c.hospital, c.episode_id,
       e.participant_id, p.name AS participant_name, e.dx_text, e.dx_code
FROM cases cs
JOIN findings f ON f.id = cs.finding_id
JOIN claims c ON c.id = f.claim_id
JOIN episodes e ON e.id = c.episode_id
JOIN participants p ON p.id = e.participant_id
`;

export interface CaseFilter {
  status?: string;
  modus?: string;
  severity?: string;
  q?: string;
}

export function listCases(db: Database.Database, f: CaseFilter = {}): CaseRow[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.status === "active") where.push("cs.status != 'decided'");
  else if (f.status) {
    where.push("cs.status = ?");
    args.push(f.status);
  }
  if (f.modus) {
    where.push("f.modus = ?");
    args.push(f.modus);
  }
  if (f.severity) {
    where.push("f.severity = ?");
    args.push(f.severity);
  }
  if (f.q) {
    where.push("(p.name LIKE ? OR c.claim_no LIKE ? OR cs.id LIKE ?)");
    args.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  }
  const sql =
    CASE_SQL +
    (where.length ? " WHERE " + where.join(" AND ") : "") +
    " ORDER BY (cs.status='decided'), CASE f.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, f.score DESC, cs.due_at";
  return db.prepare(sql).all(...args) as CaseRow[];
}

export function getCaseRow(db: Database.Database, id: string) {
  return db.prepare(CASE_SQL + " WHERE cs.id = ?").get(id) as CaseRow | undefined;
}

export interface ServiceView {
  service: Service;
  check: ServiceCheck;
  evidence: Evidence[];
  confirmations: Confirmation[];
}

export interface CaseDetail {
  row: CaseRow;
  finding: { signals: { key: string; label: string; weight: number }[]; limit_text: string; related_claim_id: string | null };
  participant: Participant;
  episode: Episode;
  claim: Claim;
  related: { claim: Claim; episode: Episode } | null;
  services: ServiceView[];
  generalEvidence: Evidence[];
  stages: Stage[];
  messages: { id: number; role: string; text: string; at: string }[];
  audit: { id: number; ts: string; actor: string; action: string; detail: string }[];
  siblings: { id: string; modus: Modus; claim_no: string; status: string }[];
}

export function getCaseDetail(db: Database.Database, id: string): CaseDetail | null {
  const row = getCaseRow(db, id);
  if (!row) return null;
  const ds = loadDataset(db);
  const ctx = buildCtx(ds);
  const claim = ctx.claim.get(row.claim_id)!;
  const episode = ctx.ep.get(claim.episode_id)!;
  const participant = ctx.part.get(episode.participant_id)!;
  const f = db.prepare("SELECT signals, limit_text, related_claim_id FROM findings WHERE id = ?").get(row.finding_id) as {
    signals: string;
    limit_text: string;
    related_claim_id: string | null;
  };
  const checks = new Map(checkServices(ctx, claim).map((c) => [c.service_id, c]));
  const evidence = ctx.evidenceByEpisode.get(episode.id) ?? [];
  const services: ServiceView[] = (ctx.servicesByEpisode.get(episode.id) ?? []).map((s) => ({
    service: s,
    check: checks.get(s.id)!,
    evidence: evidence.filter((e) => e.service_id === s.id),
    confirmations: ctx.confByService.get(s.id) ?? [],
  }));
  const rel = f.related_claim_id ? ctx.claim.get(f.related_claim_id) : undefined;
  const state: CaseState = row.status;
  const review = reviewClaim(ctx, claim, state);
  return {
    row,
    finding: { signals: JSON.parse(f.signals), limit_text: f.limit_text, related_claim_id: f.related_claim_id },
    participant,
    episode,
    claim,
    related: rel ? { claim: rel, episode: ctx.ep.get(rel.episode_id)! } : null,
    services,
    generalEvidence: evidence.filter((e) => e.service_id === null),
    stages: review.stages,
    messages: db.prepare("SELECT id, role, text, at FROM messages WHERE case_id = ? ORDER BY id").all(id) as CaseDetail["messages"],
    audit: db.prepare("SELECT id, ts, actor, action, detail FROM audit_log WHERE entity='case' AND entity_id = ? ORDER BY id").all(id) as CaseDetail["audit"],
    siblings: db
      .prepare(
        "SELECT cs.id, f.modus, c.claim_no, cs.status FROM cases cs JOIN findings f ON f.id=cs.finding_id JOIN claims c ON c.id=f.claim_id JOIN episodes e ON e.id=c.episode_id WHERE e.participant_id = ? AND cs.id != ? ORDER BY cs.id",
      )
      .all(participant.id, id) as CaseDetail["siblings"],
  };
}

export interface Stats {
  total: number;
  open: number;
  clarification: number;
  decided: number;
  overdue: number;
  byModus: Record<Modus, number>;
  bySeverity: { high: number; medium: number; low: number };
  avgFirstReviewH: number | null;
  avgDecisionH: number | null;
  resolutionRate: number;
  amountAtRisk: number;
  lookalikeCleared: number;
}

export function getSeedNow(db: Database.Database) {
  const r = db.prepare("SELECT value FROM meta WHERE key='seed_now'").get() as { value: string } | undefined;
  return r?.value ?? new Date().toISOString().slice(0, 16);
}

export function getStats(db: Database.Database): Stats {
  const rows = listCases(db);
  const now = ts(getSeedNow(db));
  const byModus: Record<Modus, number> = { repeat_billing: 0, fragmentation: 0, phantom: 0 };
  const bySeverity = { high: 0, medium: 0, low: 0 };
  let first = 0, firstN = 0, dec = 0, decN = 0, overdue = 0;
  const risk = new Map<string, number>();
  for (const r of rows) {
    byModus[r.modus]++;
    if (r.status !== "decided") {
      bySeverity[r.severity]++;
      risk.set(r.claim_id, r.amount);
      if (ts(r.due_at) < now) overdue++;
    }
    if (r.first_review_at) {
      first += (ts(r.first_review_at) - ts(r.opened_at)) / 3600000;
      firstN++;
    }
    if (r.decided_at) {
      dec += (ts(r.decided_at) - ts(r.opened_at)) / 3600000;
      decN++;
    }
  }
  const decided = rows.filter((r) => r.status === "decided").length;
  const lookalikeCleared = db
    .prepare("SELECT COUNT(*) n FROM cases cs JOIN findings f ON f.id=cs.finding_id JOIN ground_truth g ON g.claim_id=f.claim_id WHERE g.label='legit_lookalike' AND cs.decision='loloskan'")
    .get() as { n: number };
  return {
    total: rows.length,
    open: rows.filter((r) => r.status === "open").length,
    clarification: rows.filter((r) => r.status === "clarification").length,
    decided,
    overdue,
    byModus,
    bySeverity,
    avgFirstReviewH: firstN ? first / firstN : null,
    avgDecisionH: decN ? dec / decN : null,
    resolutionRate: rows.length ? decided / rows.length : 0,
    amountAtRisk: [...risk.values()].reduce((a, b) => a + b, 0),
    lookalikeCleared: lookalikeCleared.n,
  };
}

export interface PrecheckRow {
  claim: Claim;
  episode: Episode;
  participant: Participant;
  stages: Stage[];
  findings: { modus: Modus; score: number; severity: string; summary: string; caseId: string | null }[];
  verdict: "siap" | "periksa" | "tahan";
}

/** Klaim draft: hasil pemeriksaan sebelum dikirim. */
export function getPrecheck(db: Database.Database): PrecheckRow[] {
  const ds = loadDataset(db);
  const ctx = buildCtx(ds);
  const caseByFinding = new Map(
    (db.prepare("SELECT cs.id, f.claim_id, f.modus FROM cases cs JOIN findings f ON f.id=cs.finding_id").all() as { id: string; claim_id: string; modus: string }[]).map((r) => [`${r.claim_id}|${r.modus}`, r.id]),
  );
  const out: PrecheckRow[] = [];
  for (const claim of ds.claims.filter((c) => c.status === "draft")) {
    const rv = reviewClaim(ctx, claim);
    const ep = ctx.ep.get(claim.episode_id)!;
    const worst = rv.findings.reduce((a, f) => Math.max(a, f.score), 0);
    const bad = rv.stages.slice(0, 4).some((s) => s.status === "fail");
    out.push({
      claim,
      episode: ep,
      participant: ctx.part.get(ep.participant_id)!,
      stages: rv.stages,
      findings: rv.findings.map((f) => ({ modus: f.modus, score: f.score, severity: f.severity, summary: f.summary, caseId: caseByFinding.get(`${claim.id}|${f.modus}`) ?? null })),
      verdict: worst >= 50 || bad ? "tahan" : worst >= 30 || rv.stages.slice(0, 4).some((s) => s.status === "warn") ? "periksa" : "siap",
    });
  }
  const order = { tahan: 0, periksa: 1, siap: 2 };
  return out.sort((a, b) => order[a.verdict] - order[b.verdict]);
}

export interface MetricRow {
  modus: Modus;
  positives: number;
  flagged: number;
  truePositive: number;
  flaggedMedium: number;
  truePositiveMedium: number;
  recall: number;
  precisionAll: number;
  precisionMedium: number;
  lookalikeFlagged: number;
  lookalikeTotal: number;
}

export function getMetrics(db: Database.Database) {
  const truth = db.prepare("SELECT claim_id, label, mimics FROM ground_truth").all() as { claim_id: string; label: string; mimics: string | null }[];
  const findings = db.prepare("SELECT claim_id, modus, severity FROM findings").all() as { claim_id: string; modus: Modus; severity: string }[];
  const rows: MetricRow[] = (["repeat_billing", "fragmentation", "phantom"] as Modus[]).map((m) => {
    const pos = truth.filter((t) => t.label === m);
    const fl = findings.filter((f) => f.modus === m);
    const posSet = new Set(pos.map((p) => p.claim_id));
    const tp = new Set(fl.filter((f) => posSet.has(f.claim_id)).map((f) => f.claim_id)).size;
    const flMed = fl.filter((f) => f.severity !== "low");
    const tpMed = flMed.filter((f) => posSet.has(f.claim_id)).length;
    const look = truth.filter((t) => t.label === "legit_lookalike" && t.mimics === m);
    const lookFl = look.filter((l) => fl.some((f) => f.claim_id === l.claim_id)).length;
    return {
      modus: m,
      positives: pos.length,
      flagged: fl.length,
      truePositive: tp,
      flaggedMedium: flMed.length,
      truePositiveMedium: tpMed,
      recall: pos.length ? tp / pos.length : 0,
      precisionAll: fl.length ? tp / fl.length : 0,
      precisionMedium: flMed.length ? tpMed / flMed.length : 0,
      lookalikeFlagged: lookFl,
      lookalikeTotal: look.length,
    };
  });
  const cleanFlagged = findings.filter((f) => !truth.some((t) => t.claim_id === f.claim_id)).length;
  const totalClaims = (db.prepare("SELECT COUNT(*) n FROM claims").get() as { n: number }).n;
  const cleanClaims = totalClaims - new Set(truth.map((t) => t.claim_id)).size;
  return { rows, cleanFlagged, cleanClaims, totalClaims };
}

export interface HeroStory {
  participant: Participant;
  episodeA: Episode;
  episodeB: Episode;
  claims: { paid: Claim; dup: Claim; split: Claim };
  services: Service[];
  checks: Map<string, ServiceCheck>;
  findings: Record<"paid" | "dup" | "split", { modus: Modus; score: number; summary: string }[]>;
  caseIds: Record<"paid" | "dup" | "split", string[]>;
}

export function getHero(db: Database.Database) {
  const h = JSON.parse((db.prepare("SELECT value FROM meta WHERE key='hero'").get() as { value: string }).value) as {
    participant_id: string; episode_a: string; episode_b: string; claim_paid: string; claim_dup: string; claim_split: string; bronko_service: string;
  };
  const ds = loadDataset(db);
  const ctx = buildCtx(ds);
  const get = (id: string) => ctx.claim.get(id)!;
  const claims = { paid: get(h.claim_paid), dup: get(h.claim_dup), split: get(h.claim_split) };
  const findOf = (id: string) =>
    reviewClaim(ctx, get(id)).findings.map((f) => ({ modus: f.modus, score: f.score, summary: f.summary }));
  const caseIdsOf = (id: string) =>
    (db.prepare("SELECT cs.id FROM cases cs JOIN findings f ON f.id=cs.finding_id WHERE f.claim_id=? ORDER BY cs.id").all(id) as { id: string }[]).map((r) => r.id);
  return {
    ids: h,
    participant: ctx.part.get(h.participant_id)!,
    episodeA: ctx.ep.get(h.episode_a)!,
    episodeB: ctx.ep.get(h.episode_b)!,
    claims,
    servicesA: ctx.servicesByEpisode.get(h.episode_a)!,
    servicesB: ctx.servicesByEpisode.get(h.episode_b)!,
    checksA: new Map(checkServices(ctx, claims.paid).map((c) => [c.service_id, c])),
    findings: { paid: findOf(h.claim_paid), dup: findOf(h.claim_dup), split: findOf(h.claim_split) },
    caseIds: { paid: caseIdsOf(h.claim_paid), dup: caseIdsOf(h.claim_dup), split: caseIdsOf(h.claim_split) },
  };
}

export function gapDays(a: Episode, b: Episode) {
  return dayDiff(a.discharge_at, b.admit_at);
}

/** Layanan yang ditagihkan atas nama peserta, dikelompokkan per episode, untuk modul mobile. */
export function getPatientVisits(db: Database.Database, participantId: string) {
  const ds = loadDataset(db);
  const ctx = buildCtx(ds);
  const episodes = (ctx.episodesByParticipant.get(participantId) ?? []).slice().sort((a, b) => b.admit_at.localeCompare(a.admit_at));
  return episodes
    .filter((e) => (ctx.claimsByEpisode.get(e.id) ?? []).length > 0)
    .map((e) => ({
      episode: e,
      claims: ctx.claimsByEpisode.get(e.id) ?? [],
      services: (ctx.servicesByEpisode.get(e.id) ?? []).map((s) => ({ service: s, answers: ctx.confByService.get(s.id) ?? [] })),
    }));
}

export function listParticipantsWithBills(db: Database.Database, limit = 12) {
  return db
    .prepare(
      "SELECT p.id, p.name, COUNT(DISTINCT e.id) AS visits FROM participants p JOIN episodes e ON e.participant_id=p.id JOIN claims c ON c.episode_id=e.id GROUP BY p.id ORDER BY (p.id='P-0001') DESC, p.id LIMIT ?",
    )
    .all(limit) as { id: string; name: string; visits: number }[];
}
