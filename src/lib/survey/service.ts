import type Database from "better-sqlite3";
import { appendAudit } from "../audit";
import { AuthError, assertCan, assertParticipant, isInternal, respondentRole, type Principal } from "../auth/principal";
import { SYSTEM_ACTOR, createFinding, syncClaimSignals, type Actor } from "../cases/core";
import { nowIso, nowPrecise } from "../clock";
import { addDays } from "../dates";
import { json, nextId } from "../db";
import { DomainError, idempotent } from "../idem";
import { getActiveConfig } from "../ai/invocations";
import { interpret } from "../ai/nlu";
import { runInterview, runInterviewSimulated, type Fault, type InterviewInput, type InterviewResult } from "../ai/runtime";
import { ANSWER_LABEL, SESSION_LABEL, STAGE_LABEL, type SessionStatus, type Stage } from "../labels";
import { glossaryMap, loadBank } from "../standards/registry";
import type { RuleContext } from "../standards/applicability";
import { YES_NO_OPTIONS, type IndicatorVersionRow, type QuestionOption, type QuestionRow, type StageKey } from "../standards/types";
import { PROBE_INDICATOR, computeAgenda, deriveSignalHits, isMetaValue, proposableSlots, scopeMatches, type Agenda, type Candidate } from "./engine";
import { renderTemplate, type DirectedSubject } from "./phrases";

/* Layanan sesi survei. Prinsip:
   - Aturan (computeAgenda) menentukan apa yang wajib ditanya; AI hanya membantu memahami bahasa dan memilih di antara kandidat yang diizinkan.
   - Keluaran AI adalah USUL. Fakta peserta baru tercipta setelah peserta MENGONFIRMASI (atau memilih jawaban terstruktur sendiri).
   - Jawaban tidak ingat/tidak paham tersimpan sebagai nilai meta dan bernilai 0 pada sinyal (I3).
   - Fakta tidak dihapus: koreksi menggantikan (superseded) dan menyimpan jejak asal.
   - Kegagalan AI tidak menghentikan sesi: runtime jatuh ke fallback deterministik dan mencatatnya. */

export interface SessionRow {
  id: string; invitation_id: string | null; episode_id: string; participant_id: string; facility_id: string; stage: Stage; mode: "routine" | "directed";
  respondent_role: "self" | "companion"; companion_id: string | null; status: SessionStatus; revision: number; indicator_versions_json: string; subject_json: string | null;
  budget_core: number; budget_clarif: number; core_asked: number; clarif_asked: number; uses_draft: number; bank_mode: "fixed" | "adaptive_clarify";
  ai_mode_last: string | null; pending_next_json: string | null; started_at: string | null; last_activity_at: string | null; ended_at: string | null; end_reason: string | null;
  deadline_at: string | null; is_sandbox: number;
}
export interface TurnRow {
  id: string; session_id: string; seq: number; question_id: string; question_text: string; question_kind: "core" | "clarification" | "prerequisite";
  text_source: "bank" | "ai_phrase" | "template"; selected_by: "rules" | "ai" | "fallback"; selection_reason: string | null; invocation_id: string | null; asked_at: string;
  answer_text: string | null; answer_choice: string | null; answered_at: string | null; idem_key: string | null; attempts: number; needs_rephrase: number; status: "asked" | "answered" | "skipped";
}
export interface ProposalRow {
  id: string; session_id: string; turn_id: string; slot: string; subject: string | null; value: string; quote: string | null; needs_confirmation: number;
  origin: "choice" | "rules" | "ai"; validation: "accepted" | "rejected"; reject_reason: string | null; state: "proposed" | "confirmed" | "corrected" | "dismissed";
  invocation_id: string | null; created_at: string; resolved_at: string | null;
}
export interface FactRow {
  id: string; session_id: string; slot: string; subject: string | null; value: string; indicator_id: string | null; source_turn_id: string | null; source_quote: string | null;
  origin: "choice" | "confirmed_proposal" | "correction" | "context"; proposal_id: string | null; status: "active" | "superseded"; supersedes_id: string | null; revision: number; created_at: string;
}

interface PendingNext {
  question_id: string | null;
  selected_by: "rules" | "ai" | "fallback";
  reason: string;
  invocation_id: string | null;
  phrase: string | null;
  mode: string;
}

export const getSession = (db: Database.Database, id: string) => db.prepare("SELECT * FROM survey_sessions WHERE id = ?").get(id) as SessionRow | undefined;
function mustSession(db: Database.Database, id: string) {
  const s = getSession(db, id);
  if (!s) throw new DomainError("Sesi survei tidak ditemukan.", 404);
  return s;
}
const turnsOf = (db: Database.Database, sid: string) => db.prepare("SELECT * FROM survey_turns WHERE session_id = ? ORDER BY seq").all(sid) as TurnRow[];
const activeFacts = (db: Database.Database, sid: string) => db.prepare("SELECT * FROM participant_facts WHERE session_id = ? AND status = 'active' ORDER BY created_at, id").all(sid) as FactRow[];
const proposalsOf = (db: Database.Database, sid: string) => db.prepare("SELECT * FROM fact_proposals WHERE session_id = ? ORDER BY created_at, id").all(sid) as ProposalRow[];

const A = (a: Actor) => ({ actor: a.id, actor_role: a.role });

/* ---------- Otorisasi ---------- */
/** Peserta/pendamping hanya pada sesinya; pendamping hanya pada sesi yang ia jawab. Staf internal hanya baca (ai.view). */
export function authSession(db: Database.Database, p: Principal, s: SessionRow, write: boolean) {
  if (isInternal(p)) {
    if (write) throw new AuthError("Staf tidak dapat menjawab survei atas nama peserta.");
    assertCan(p, "ai.view");
    return;
  }
  assertCan(p, "survey.answer");
  assertParticipant(db, p, s.participant_id);
  if (respondentRole(p) !== s.respondent_role || (p.role === "pendamping" && p.companionId !== s.companion_id)) throw new AuthError("Sesi ini dijawab oleh pihak lain.");
}

/* ---------- Konteks sesi ---------- */
interface EpisodeInfo { id: string; participant_id: string; facility_id: string; hospital: string | null; kind: "RJTL" | "RITL"; phase: string; admit_at: string; discharge_at: string; context: Record<string, unknown>; facility_kind: "fkrtl" | "fktp" }
function episodeInfo(db: Database.Database, id: string): EpisodeInfo {
  const r = db.prepare("SELECT e.id, e.participant_id, e.facility_id, e.hospital, e.kind, e.phase, e.admit_at, e.discharge_at, e.context_json, f.kind AS facility_kind FROM episodes e JOIN facilities f ON f.id = e.facility_id WHERE e.id = ?").get(id) as (Omit<EpisodeInfo, "context"> & { context_json: string }) | undefined;
  if (!r) throw new DomainError("Episode tidak ditemukan.", 404);
  const { context_json, ...rest } = r;
  return { ...rest, context: json<Record<string, unknown>>(context_json, {}) };
}
export function scopeTagsOf(ep: Pick<EpisodeInfo, "facility_kind" | "kind">): string[] {
  return [ep.facility_kind === "fkrtl" ? "hospital" : "puskesmas", ep.kind === "RITL" ? "inpatient_discharge" : "outpatient"];
}
const primitiveContext = (c: Record<string, unknown>): RuleContext => Object.fromEntries(Object.entries(c).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v) || v === null)) as RuleContext;

interface Loaded {
  s: SessionRow;
  ep: EpisodeInfo;
  indicators: IndicatorVersionRow[];
  questions: QuestionRow[];
  subject: string | null;
  subjectInfo: DirectedSubject | null;
  facts: Record<string, string>;
  factRows: FactRow[];
  turns: TurnRow[];
  scope: string[];
}
export const factKey = (slot: string, subject: string | null) => (subject ? `${slot}@${subject}` : slot);

function load(db: Database.Database, s: SessionRow): Loaded {
  const ep = episodeInfo(db, s.episode_id);
  const ids = json<string[]>(s.indicator_versions_json, []);
  const bank = loadBank(db, { versionIds: ids });
  const subjectInfo = json<DirectedSubject | null>(s.subject_json, null);
  const subject = subjectInfo?.service_id ?? null;
  const factRows = activeFacts(db, s.id);
  const facts: Record<string, string> = {};
  for (const f of factRows) facts[factKey(f.slot, f.subject)] = f.value;
  return { s, ep, indicators: bank.indicators, questions: bank.questions, subject, subjectInfo, facts, factRows, turns: turnsOf(db, s.id), scope: scopeTagsOf(ep) };
}

function agendaOf(L: Loaded, extra: Record<string, string> = {}): Agenda {
  return computeAgenda({
    stage: L.s.stage as StageKey,
    indicators: L.indicators,
    questions: L.questions,
    scopeTags: L.scope,
    context: primitiveContext(L.ep.context),
    facts: { ...L.facts, ...extra },
    asked: L.turns.map((t) => t.question_id),
    coreAsked: L.s.core_asked,
    clarifAsked: L.s.clarif_asked,
    budgetCore: L.s.budget_core,
    budgetClarif: L.s.budget_clarif,
    subject: L.subject,
  });
}

/* ---------- Pelabelan untuk tampilan ---------- */
function slotDef(L: Pick<Loaded, "indicators">, slot: string) {
  for (const i of L.indicators) {
    const d = i.slots.find((x) => x.id === slot);
    if (d) return { def: d, indicator: i };
  }
  return null;
}
export function valueLabel(L: Pick<Loaded, "indicators">, slot: string, value: string): string {
  const d = slotDef(L, slot)?.def;
  return d?.valueLabels?.[value] ?? ANSWER_LABEL[value] ?? value;
}
export const slotLabel = (L: Pick<Loaded, "indicators">, slot: string) => slotDef(L, slot)?.def.label ?? slot;
function optionsFor(L: Pick<Loaded, "questions">, qid: string): QuestionOption[] {
  const q = L.questions.find((x) => x.id === qid);
  if (!q) return YES_NO_OPTIONS;
  if (q.answer_type === "free") return [];
  return q.options.length ? q.options : YES_NO_OPTIONS;
}

/* ---------- Ringkasan untuk antarmuka ---------- */
export interface OpenQuestion {
  turn_id: string;
  seq: number;
  question_id: string;
  text: string;
  helper: string | null;
  kind: TurnRow["question_kind"];
  options: QuestionOption[];
  needs_rephrase: boolean;
  text_allowed: boolean;
  glossary: { term: string; plain: string }[];
  text_source: TurnRow["text_source"];
}
export interface ReviewItem {
  id: string;
  slot: string;
  slot_label: string;
  value: string;
  value_label: string;
  quote: string | null;
  allowed: { value: string; label: string }[];
  origin: ProposalRow["origin"];
}
export interface SessionView {
  session: {
    id: string; stage: Stage; stage_label: string; mode: "routine" | "directed"; status: SessionStatus; status_label: string; revision: number; respondent_role: "self" | "companion";
    ai_mode_last: string | null; started_at: string | null; ended_at: string | null; end_reason: string | null; episode_id: string; facility_name: string | null; episode_kind: string;
    admit_at: string; discharge_at: string; uses_draft: boolean; subject: DirectedSubject | null;
  };
  history: { turn_id: string; seq: number; question: string; answer: string | null; status: TurnRow["status"] }[];
  open: OpenQuestion | null;
  review: ReviewItem[];
  facts: { id: string; slot: string; slot_label: string; value: string; value_label: string; indicator_title: string | null; origin: FactRow["origin"]; turn_id: string | null; corrected: boolean; editable: { value: string; label: string }[] }[];
  progress: { answered: number; required: number; unknown: number; unresolved: number; may_grow: boolean; asked: number };
  outcome: { status: SessionStatus; end_reason: string | null; lines: string[]; reports_created: number } | null;
  notice: string | null;
}

const END_REASON_LABEL: Record<string, string> = {
  coverage_complete: "Semua pertanyaan yang relevan sudah terjawab.",
  budget_reached: "Batas jumlah pertanyaan tercapai; sisanya tidak ditanyakan agar tidak melelahkan.",
  unresolved_items: "Ada hal yang belum terjawab; tidak apa-apa.",
  participant_stopped: "Anda memilih berhenti. Jawaban yang sudah ada tetap tersimpan.",
  expired: "Waktu pengisian habis. Jawaban yang sudah ada tetap tersimpan.",
  no_applicable: "Tidak ada pertanyaan yang berlaku untuk perawatan ini.",
};

function buildView(db: Database.Database, s: SessionRow, notice: string | null = null, extra: { reportsCreated?: number } = {}): SessionView {
  const L = load(db, s);
  const agenda = agendaOf(L);
  const props = proposalsOf(db, s.id);
  const pending = props.filter((x) => x.state === "proposed");
  const open = L.turns.find((t) => t.status === "asked") ?? null;
  const gl = glossaryMap(db);
  let openQ: OpenQuestion | null = null;
  if (open && s.status === "active" && pending.length === 0) {
    const q = L.questions.find((x) => x.id === open.question_id);
    const text = open.question_text.toLowerCase();
    const options = optionsFor(L, open.question_id);
    openQ = {
      turn_id: open.id, seq: open.seq, question_id: open.question_id, text: open.question_text, helper: q?.helper ? renderTemplate(q.helper, L.subjectInfo) : null, kind: open.question_kind,
      options, needs_rephrase: !!open.needs_rephrase, text_allowed: open.attempts < 2,
      glossary: Object.entries(gl).filter(([term]) => text.includes(term.toLowerCase())).map(([term, plain]) => ({ term, plain })), text_source: open.text_source,
    };
  }
  const review: ReviewItem[] = pending.map((x) => {
    const d = slotDef(L, x.slot);
    return {
      id: x.id, slot: x.slot, slot_label: slotLabel(L, x.slot), value: x.value, value_label: valueLabel(L, x.slot, x.value), quote: x.quote, origin: x.origin,
      allowed: [...(d?.def.values ?? []), "unknown"].map((v) => ({ value: v, label: valueLabel(L, x.slot, v) })),
    };
  });
  const facts = L.factRows.map((f) => {
    const d = slotDef(L, f.slot);
    return {
      id: f.id, slot: f.slot, slot_label: slotLabel(L, f.slot), value: f.value, value_label: valueLabel(L, f.slot, f.value), indicator_title: d?.indicator.title ?? null, origin: f.origin, turn_id: f.source_turn_id,
      corrected: f.origin === "correction", editable: [...(d?.def.values ?? []), "unknown"].map((v) => ({ value: v, label: valueLabel(L, f.slot, v) })),
    };
  });
  const fac = db.prepare("SELECT name FROM facilities WHERE id = ?").get(s.facility_id) as { name: string } | undefined;
  const subject = L.subjectInfo;
  const ended = s.status !== "active";
  return {
    session: {
      id: s.id, stage: s.stage, stage_label: STAGE_LABEL[s.stage], mode: s.mode, status: s.status, status_label: SESSION_LABEL[s.status], revision: s.revision, respondent_role: s.respondent_role,
      ai_mode_last: s.ai_mode_last, started_at: s.started_at, ended_at: s.ended_at, end_reason: s.end_reason, episode_id: s.episode_id, facility_name: fac?.name ?? null,
      episode_kind: L.ep.kind === "RITL" ? "Rawat inap" : "Rawat jalan", admit_at: L.ep.admit_at, discharge_at: L.ep.discharge_at, uses_draft: !!s.uses_draft, subject,
    },
    history: L.turns.filter((t) => t.status === "answered").map((t) => ({ turn_id: t.id, seq: t.seq, question: t.question_text, answer: t.answer_text, status: t.status })),
    open: openQ,
    review,
    facts,
    progress: { ...pick(agenda.coverage), asked: L.turns.filter((t) => t.status === "answered").length },
    outcome: ended ? { status: s.status, end_reason: s.end_reason, lines: [END_REASON_LABEL[s.end_reason ?? ""] ?? ""].filter(Boolean), reports_created: extra.reportsCreated ?? countT4(db, s.id) } : null,
    notice,
  };
}
const pick = (c: Agenda["coverage"]) => ({ answered: c.answered, required: c.required, unknown: c.unknown, unresolved: c.unresolved, may_grow: c.may_grow });
const countT4 = (db: Database.Database, sid: string) => (db.prepare("SELECT COUNT(*) n FROM findings WHERE dedupe_key LIKE ?").get(`T4:${sid}:%`) as { n: number }).n;

/** Fakta aktif sesi dengan label awam (untuk riwayat). */
export function describeFacts(db: Database.Database, sessionId: string) {
  const L = load(db, mustSession(db, sessionId));
  return L.factRows.map((f) => ({ slot_label: slotLabel(L, f.slot), value_label: valueLabel(L, f.slot, f.value), origin: f.origin }));
}

export function getSessionView(db: Database.Database, p: Principal, sessionId: string): SessionView {
  const s = mustSession(db, sessionId);
  authSession(db, p, s, false);
  return buildView(db, s);
}

/* ---------- Mulai sesi ---------- */
export interface StartInput {
  invitation_id?: string;
  episode_id?: string;
  stage?: Stage;
  idem_key?: string;
}

function freezeIndicators(db: Database.Database, ep: EpisodeInfo, stage: Stage) {
  const bank = loadBank(db);
  const scope = scopeTagsOf(ep);
  const inds = bank.indicators.filter((i) => (i.stage === stage && scopeMatches(i.scope, scope)) || i.indicator_id === PROBE_INDICATOR);
  const draft = (db.prepare("SELECT id, status FROM standard_versions").all() as { id: string; status: string }[]).filter((v) => v.status === "draft").map((v) => v.id);
  return { ids: inds.map((i) => i.id), usesDraft: inds.some((i) => draft.includes(i.standard_version_id)) };
}

export function startSession(db: Database.Database, p: Principal, input: StartInput): SessionView {
  assertCan(p, "survey.answer");
  const r = idempotent(db, `survey.start:${p.id}`, input.idem_key, () => {
    return db.transaction(() => {
      let inv: { id: string; episode_id: string; participant_id: string; stage: Stage; mode: "routine" | "directed"; status: string; subject_json: string | null; session_id: string | null; expires_at: string | null } | undefined;
      if (input.invitation_id) {
        inv = db.prepare("SELECT * FROM invitations WHERE id = ?").get(input.invitation_id) as typeof inv;
        if (!inv) throw new DomainError("Undangan tidak ditemukan.", 404);
        assertParticipant(db, p, inv.participant_id);
        if (inv.session_id) {
          const ex = getSession(db, inv.session_id);
          if (ex && ex.status === "active") {
            authSession(db, p, ex, true);
            return ex.id;
          }
          throw new DomainError("Undangan ini sudah diselesaikan atau sudah dikerjakan oleh pihak lain.", 409, "invitation_used");
        }
        if (["answered", "expired", "cancelled"].includes(inv.status)) throw new DomainError("Undangan ini sudah tidak berlaku.", 409, "invitation_closed");
        if (inv.expires_at && inv.expires_at < nowIso()) throw new DomainError("Undangan ini sudah kedaluwarsa.", 409, "invitation_expired");
      }
      const episodeId = inv?.episode_id ?? input.episode_id;
      if (!episodeId) throw new DomainError("Pilih episode perawatan atau undangan.", 422);
      const ep = episodeInfo(db, episodeId);
      assertParticipant(db, p, ep.participant_id);
      const stage: Stage = inv?.stage ?? input.stage ?? "post";
      const mode = inv?.mode ?? "routine";
      if (!inv && stage === "directed") throw new DomainError("Konfirmasi terarah hanya melalui undangan.", 422);
      const resp = respondentRole(p);
      if (!inv) {
        const ex = db.prepare("SELECT * FROM survey_sessions WHERE episode_id = ? AND stage = ? AND mode = 'routine' AND respondent_role = ? AND status = 'active' AND is_sandbox = 0").get(ep.id, stage, resp) as SessionRow | undefined;
        if (ex) return ex.id;
        const done = db.prepare("SELECT 1 FROM survey_sessions WHERE episode_id = ? AND stage = ? AND mode = 'routine' AND status IN ('completed','partial') AND is_sandbox = 0 LIMIT 1").get(ep.id, stage);
        if (done) throw new DomainError("Survei tahap ini untuk episode tersebut sudah diisi.", 409, "already_done");
      }
      const subject = inv?.subject_json ?? null;
      const cfg = getActiveConfig(db);
      const frozen = freezeIndicators(db, ep, stage);
      const id = nextId(db, "SS");
      const now = nowPrecise();
      db.prepare(
        "INSERT INTO survey_sessions (id, invitation_id, episode_id, participant_id, facility_id, stage, mode, respondent_role, companion_id, status, revision, indicator_versions_json, subject_json, budget_core, budget_clarif, core_asked, clarif_asked, uses_draft, bank_mode, started_at, last_activity_at, deadline_at, is_sandbox) VALUES (?,?,?,?,?,?,?,?,?,'active',0,?,?,?,?,0,0,?,?,?,?,?,0)",
      ).run(id, inv?.id ?? null, ep.id, ep.participant_id, ep.facility_id, stage, mode, resp, resp === "companion" ? p.companionId : null, JSON.stringify(frozen.ids), subject, cfg.budget_core, cfg.budget_clarif, frozen.usesDraft ? 1 : 0, cfg.bank_mode, now, now, addDays(nowIso(), 3));
      if (inv) db.prepare("UPDATE invitations SET status = 'opened', session_id = ? WHERE id = ?").run(id, inv.id);
      appendAudit(db, { ...A(p), action: "sesi_survei_dimulai", entity: "survey_session", entity_id: id, detail: { tahap: stage, mode, responden: resp, episode: ep.id, memakai_draf: frozen.usesDraft } });
      const s = getSession(db, id)!;
      advance(db, s, null, p);
      return id;
    })();
  });
  return buildView(db, mustSession(db, r.value));
}

/* ---------- Memilih dan membuka pertanyaan berikutnya ---------- */
function choose(agenda: Agenda, hint: PendingNext | null): { cand: Candidate; selected_by: TurnRow["selected_by"]; reason: string; invocation_id: string | null; phrase: string | null } | null {
  if (agenda.finished || !agenda.eligible.length) return null;
  const byAi = hint?.question_id ? agenda.eligible.find((c) => c.question.id === hint.question_id) : undefined;
  if (byAi && hint) return { cand: byAi, selected_by: hint.selected_by, reason: hint.reason, invocation_id: hint.invocation_id, phrase: hint.phrase };
  const first = agenda.eligible[0];
  return { cand: first, selected_by: "rules", reason: hint?.question_id ? `${first.reason}|usulan_ai_tidak_berlaku` : first.reason, invocation_id: null, phrase: null };
}

function openTurn(db: Database.Database, L: Loaded, c: NonNullable<ReturnType<typeof choose>>) {
  const seq = L.turns.length ? Math.max(...L.turns.map((t) => t.seq)) + 1 : 1;
  const id = nextId(db, "TN");
  const base = renderTemplate(c.cand.question.text, L.subjectInfo);
  const useAiText = !!c.phrase && c.cand.kind !== "core";
  const text = useAiText ? c.phrase! : base;
  db.prepare(
    "INSERT INTO survey_turns (id, session_id, seq, question_id, question_text, question_kind, text_source, selected_by, selection_reason, invocation_id, asked_at, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,'asked')",
  ).run(id, L.s.id, seq, c.cand.question.id, text, c.cand.kind, useAiText ? "ai_phrase" : L.subjectInfo ? "template" : "bank", c.selected_by, c.reason, c.invocation_id, nowPrecise());
  db.prepare(`UPDATE survey_sessions SET ${c.cand.kind === "core" ? "core_asked = core_asked + 1" : "clarif_asked = clarif_asked + 1"} WHERE id = ?`).run(L.s.id);
}

function bump(db: Database.Database, sid: string) {
  db.prepare("UPDATE survey_sessions SET revision = revision + 1, last_activity_at = ? WHERE id = ?").run(nowPrecise(), sid);
}

/** Setelah jawaban/konfirmasi: tentukan pertanyaan berikutnya atau akhiri sesi. */
function advance(db: Database.Database, s0: SessionRow, hint: PendingNext | null, by: Actor) {
  const s = getSession(db, s0.id)!;
  const L = load(db, s);
  const agenda = agendaOf(L);
  const c = choose(agenda, hint);
  db.prepare("UPDATE survey_sessions SET pending_next_json = NULL WHERE id = ?").run(s.id);
  if (!c) return finish(db, L, agenda, agenda.endStatus ?? "completed", agenda.endReason ?? "coverage_complete", by);
  openTurn(db, L, c);
}

/* ---------- Mengakhiri sesi dan menurunkan temuan T4 ---------- */
function finish(db: Database.Database, L: Loaded, agenda: Agenda | null, status: "completed" | "partial" | "expired" | "cancelled", reason: string, by: Actor) {
  const s = L.s;
  db.prepare("UPDATE survey_sessions SET status = ?, ended_at = ?, end_reason = ?, pending_next_json = NULL, last_activity_at = ? WHERE id = ?").run(status, nowPrecise(), reason, nowPrecise(), s.id);
  bump(db, s.id);
  let reports = 0;
  if (!s.is_sandbox && status !== "cancelled" && s.stage !== "directed") {
    const hits = deriveSignalHits(L.indicators, L.facts, L.subject);
    const help = !!db.prepare("SELECT 1 FROM help_requests WHERE session_id = ? AND status = 'open' LIMIT 1").get(s.id);
    for (const h of hits) {
      const r = createFinding(db, SYSTEM_ACTOR, {
        type: "T4", source: "survey_routine", episode_id: s.episode_id, facility_id: s.facility_id, indicator_id: h.indicator_id,
        title: `Laporan peserta: ${L.indicators.find((i) => i.id === h.indicator_version_id)?.title ?? h.indicator_id}`,
        summary: `${h.note} Sumber: survei tahap ${STAGE_LABEL[s.stage].toLowerCase()} (${s.id})${s.respondent_role === "companion" ? ", dijawab pendamping" : ""}. Ini informasi awal dari peserta, belum diverifikasi.`,
        limit_text: "Satu laporan peserta bukan bukti. Perlu dicocokkan dengan catatan faskes; jawaban 'tidak ingat' tidak pernah dihitung sebagai sinyal.",
        signals: [{ key: `laporan_${h.category}`, label: h.note, weight: 40 }], score: 40, dedupe_key: `T4:${s.id}:${h.indicator_id}:${h.category}`, category: h.category, help,
      });
      if (r.created) reports++;
    }
  }
  if (s.invitation_id) db.prepare("UPDATE invitations SET status = ? WHERE id = ?").run(status === "expired" || status === "cancelled" ? status : "answered", s.invitation_id);
  appendAudit(db, { ...A(by), action: "sesi_survei_berakhir", entity: "survey_session", entity_id: s.id, detail: { status, alasan: reason, laporan_dibuat: reports, fakta: Object.keys(L.facts).length, cakupan: agenda?.coverage ?? null } });
  // konfirmasi terarah memengaruhi sinyal dokumentasi (T1): hitung ulang. Hasilnya tetap sinyal, bukan putusan.
  if (!s.is_sandbox && s.stage === "directed") syncClaimSignals(db, SYSTEM_ACTOR);
}

/* ---------- Menjawab ---------- */
export interface AnswerInput {
  session_id: string;
  turn_id: string;
  revision: number;
  idem_key?: string;
  choice?: string;
  text?: string;
}
interface Prepared {
  s: SessionRow;
  turn: TurnRow;
  kind: "choice" | "text";
  choice?: string;
  text: string;
  replay: boolean;
  aiInput: InterviewInput;
  provisional: string[];
}

const clean = (t: string) => t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/\s+/g, " ").trim();

function checkRevision(s: SessionRow, rev: number) {
  if (!Number.isInteger(rev) || rev !== s.revision) throw new DomainError("Sesi telah berubah di tempat lain. Muat ulang untuk melanjutkan.", 409, "stale_revision");
}

function prepareAnswer(db: Database.Database, p: Principal, inp: AnswerInput): Prepared {
  const s = mustSession(db, inp.session_id);
  authSession(db, p, s, true);
  const turn = db.prepare("SELECT * FROM survey_turns WHERE id = ? AND session_id = ?").get(inp.turn_id, s.id) as TurnRow | undefined;
  if (!turn) throw new DomainError("Pertanyaan tidak ditemukan pada sesi ini.", 404);
  const hasChoice = typeof inp.choice === "string" && inp.choice.length > 0;
  const text = clean(inp.text ?? "");
  if (hasChoice === !!text) throw new DomainError("Kirim tepat satu: pilihan jawaban atau teks.", 422);
  if (text.length > 600) throw new DomainError("Jawaban terlalu panjang (maksimal 600 karakter).", 422);
  // pengulangan kiriman dengan kunci yang sama: tidak ada efek samping
  if (inp.idem_key && turn.idem_key === inp.idem_key) {
    if (turn.status === "answered" || s.status !== "active") return { s, turn, kind: hasChoice ? "choice" : "text", choice: inp.choice, text, replay: true, aiInput: null as never, provisional: [] };
    throw new DomainError("Jawaban sedang diproses.", 409, "in_progress");
  }
  if (s.status !== "active") throw new DomainError(`Sesi sudah ${SESSION_LABEL[s.status].toLowerCase()}.`, 409, "session_closed");
  checkRevision(s, inp.revision);
  if (turn.status !== "asked") throw new DomainError("Pertanyaan ini sudah dijawab.", 409, "turn_answered");
  if ((db.prepare("SELECT 1 FROM fact_proposals WHERE session_id = ? AND state = 'proposed' LIMIT 1").get(s.id))) throw new DomainError("Konfirmasi dulu hal yang saya tangkap dari jawaban sebelumnya.", 409, "review_pending");
  const L = load(db, s);
  if (!hasChoice && turn.attempts >= 2) throw new DomainError("Silakan pilih salah satu jawaban yang tersedia.", 422, "text_not_allowed");
  if (hasChoice && !optionsFor(L, turn.question_id).some((o) => o.value === inp.choice)) throw new DomainError("Pilihan jawaban tidak sah untuk pertanyaan ini.", 422);
  // klaim giliran ini (kunci idempotensi) sebelum memanggil AI
  const claimed = db.prepare("UPDATE survey_turns SET idem_key = ? WHERE id = ? AND status = 'asked' AND idem_key IS NULL").run(inp.idem_key ?? `auto:${nextId(db, "CLM", 6)}`, turn.id).changes;
  if (!claimed) throw new DomainError("Jawaban sedang diproses.", 409, "in_progress");
  const answerText = hasChoice ? (optionsFor(L, turn.question_id).find((o) => o.value === inp.choice)?.label ?? inp.choice!) : text;
  const { input: aiInput, provisional } = composeInterviewInput({
    session_id: s.id, revision: s.revision, stage: s.stage, indicator_version_ids: json<string[]>(s.indicator_versions_json, []), indicators: L.indicators, questions: L.questions, scope: L.scope,
    context: primitiveContext(L.ep.context), subject: L.subject, subjectInfo: L.subjectInfo, facts: L.facts, factRows: L.factRows, askedIds: L.turns.map((t) => t.question_id),
    coreAsked: s.core_asked, clarifAsked: s.clarif_asked, budgetCore: s.budget_core, budgetClarif: s.budget_clarif,
    turn: { id: turn.id, question_id: turn.question_id, question_text: turn.question_text }, answerText, choice: hasChoice ? inp.choice : undefined,
  });
  return { s, turn, kind: hasChoice ? "choice" : "text", choice: inp.choice, text: answerText, replay: false, aiInput, provisional };
}

export interface ComposeArgs {
  session_id: string;
  revision: number;
  stage: Stage;
  indicator_version_ids: string[];
  indicators: IndicatorVersionRow[];
  questions: QuestionRow[];
  scope: string[];
  context: RuleContext;
  subject: string | null;
  subjectInfo: DirectedSubject | null;
  facts: Record<string, string>;
  factRows: { slot: string; value: string; subject: string | null }[];
  askedIds: string[];
  coreAsked: number;
  clarifAsked: number;
  budgetCore: number;
  budgetClarif: number;
  turn: { id: string; question_id: string; question_text: string };
  answerText: string;
  choice?: string;
}

/** Menyusun permintaan AI dari keadaan sesi (dipakai sesi nyata dan sandbox). Kandidat dihitung dari agenda SETELAH fakta sementara diterapkan,
    agar pertanyaan lanjutan yang baru terbuka (mis. alasan obat sebagian) ikut menjadi kandidat; pilihan akhir tetap divalidasi ulang terhadap agenda yang sebenarnya. */
export function composeInterviewInput(a: ComposeArgs): { input: InterviewInput; provisional: string[] } {
  const base = {
    stage: a.stage as StageKey, indicators: a.indicators, questions: a.questions, scopeTags: a.scope, context: a.context, asked: a.askedIds, coreAsked: a.coreAsked, clarifAsked: a.clarifAsked,
    budgetCore: a.budgetCore, budgetClarif: a.budgetClarif, subject: a.subject,
  };
  const q = a.questions.find((x) => x.id === a.turn.question_id);
  const agenda0 = computeAgenda({ ...base, facts: a.facts });
  const allowed_slots = [...proposableSlots(agenda0).entries()].filter(([slot]) => a.facts[factKey(slot, a.subject)] === undefined).map(([slot, values]) => ({ slot, values }));
  const last_turn = { turn_id: a.turn.id, question_id: a.turn.question_id, question_text: a.turn.question_text, answer_text: a.answerText, target_slot: q?.target_slot };
  const prov = a.choice ? [] : interpret({ last_turn, allowed_slots }).items.filter((i) => allowed_slots.find((x) => x.slot === i.slot)?.values.includes(i.value));
  const provFacts: Record<string, string> = Object.fromEntries(prov.map((i) => [factKey(i.slot, a.subject), i.value]));
  if (a.choice && q) provFacts[factKey(q.target_slot, a.subject)] = a.choice;
  const agenda1 = computeAgenda({ ...base, facts: { ...a.facts, ...provFacts } });
  const filled = new Set(prov.map((i) => i.slot).concat(a.choice && q ? [q.target_slot] : []));
  const seen = new Set<string>();
  const cands = [...agenda1.eligible, ...agenda0.eligible].filter((c) => !seen.has(c.question.id) && !filled.has(c.question.target_slot) && (seen.add(c.question.id), true));
  const input: InterviewInput = {
    session_id: a.session_id, session_revision: a.revision, stage: a.stage, indicator_versions: a.indicator_version_ids,
    episode_context: a.context as InterviewInput["episode_context"],
    confirmed_facts: a.factRows.map((f) => ({ slot: f.slot, value: f.value, subject: f.subject })),
    asked_question_ids: a.askedIds, last_turn,
    candidate_questions: cands.map((c) => ({ id: c.question.id, target_slot: c.question.target_slot, text: renderTemplate(c.question.text, a.subjectInfo) })),
    allowed_slots,
  };
  return { input, provisional: prov.map((i) => i.slot) };
}

function releaseClaim(db: Database.Database, turnId: string) {
  db.prepare("UPDATE survey_turns SET idem_key = NULL WHERE id = ? AND status = 'asked'").run(turnId);
}

function hintFrom(r: InterviewResult | null): PendingNext | null {
  if (!r) return null;
  return {
    question_id: r.report.next_question_id, reason: r.report.reason_code ?? "no_candidate", invocation_id: r.invocation_id, phrase: r.report.phrase_suggestion, mode: r.mode,
    selected_by: r.mode === "fallback" ? "fallback" : r.mode === "live" ? "ai" : "rules",
  };
}

function insertFact(db: Database.Database, L: Loaded, f: { slot: string; value: string; turn_id: string | null; quote: string | null; origin: FactRow["origin"]; proposal_id?: string | null }) {
  const subject = L.subject;
  const prev = db.prepare("SELECT id FROM participant_facts WHERE session_id = ? AND slot = ? AND COALESCE(subject,'') = COALESCE(?, '') AND status = 'active'").get(L.s.id, f.slot, subject) as { id: string } | undefined;
  if (prev) db.prepare("UPDATE participant_facts SET status = 'superseded' WHERE id = ?").run(prev.id);
  const id = nextId(db, "FK");
  db.prepare("INSERT INTO participant_facts (id, session_id, slot, subject, value, indicator_id, source_turn_id, source_quote, origin, proposal_id, status, supersedes_id, revision, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,'active',?,?,?)").run(
    id, L.s.id, f.slot, subject, f.value, slotDef(L, f.slot)?.indicator.indicator_id ?? null, f.turn_id, f.quote, f.origin, f.proposal_id ?? null, prev?.id ?? null, L.s.revision, nowPrecise(),
  );
  return id;
}

function openHelp(db: Database.Database, p: Principal, s: SessionRow, reason: string) {
  const ex = db.prepare("SELECT id FROM help_requests WHERE session_id = ? AND status = 'open' AND reason = ?").get(s.id, reason);
  if (ex) return;
  const id = nextId(db, "HLP");
  db.prepare("INSERT INTO help_requests (id, session_id, participant_id, episode_id, reason, status, channel, created_at) VALUES (?,?,?,?,?,'open','ai_flag',?)").run(id, s.id, s.participant_id, s.episode_id, reason, nowPrecise());
  appendAudit(db, { ...A(p), action: "permintaan_bantuan_dibuat", entity: "help_request", entity_id: id, detail: { sesi: s.id, alasan: reason, saluran: "ai_flag" } });
}

function applyChoice(db: Database.Database, p: Principal, prep: Prepared, ai: InterviewResult | null, inp: AnswerInput): SessionView {
  return db.transaction(() => {
    const s = mustSession(db, prep.s.id);
    checkRevision(s, prep.s.revision);
    const L = load(db, s);
    const q = L.questions.find((x) => x.id === prep.turn.question_id);
    if (!q) throw new DomainError("Butir pertanyaan tidak ditemukan.", 404);
    const choice = prep.choice!;
    // 'tidak paham' pertama kali: jelaskan ulang, jangan catat dulu
    if (choice === "not_understood" && prep.turn.attempts === 0) {
      db.prepare("UPDATE survey_turns SET attempts = 1, needs_rephrase = 1, idem_key = NULL WHERE id = ?").run(prep.turn.id);
      bump(db, s.id);
      return buildView(db, mustSession(db, s.id), "Tidak apa-apa. Ini penjelasan singkatnya; Anda juga boleh memilih 'Saya lupa / tidak yakin'.");
    }
    db.prepare("UPDATE survey_turns SET answer_choice = ?, answer_text = ?, answered_at = ?, status = 'answered', idem_key = ? WHERE id = ?").run(choice, prep.text, nowPrecise(), inp.idem_key ?? prep.turn.idem_key, prep.turn.id);
    insertFact(db, L, { slot: q.target_slot, value: choice, turn_id: prep.turn.id, quote: prep.text, origin: "choice" });
    appendAudit(db, { ...A(p), action: "jawaban_dicatat", entity: "survey_turn", entity_id: prep.turn.id, detail: { sesi: s.id, slot: q.target_slot, nilai: choice, cara: "pilihan" } });
    if (ai) db.prepare("UPDATE survey_sessions SET ai_mode_last = ? WHERE id = ?").run(ai.mode, s.id);
    bump(db, s.id);
    advance(db, s, hintFrom(ai), p);
    return buildView(db, mustSession(db, s.id));
  })();
}

function applyText(db: Database.Database, p: Principal, prep: Prepared, ai: InterviewResult, inp: AnswerInput): SessionView {
  return db.transaction(() => {
    const s = mustSession(db, prep.s.id);
    checkRevision(s, prep.s.revision);
    const now = nowPrecise();
    const rep = ai.report;
    const L = load(db, s);
    const subject = L.subject;
    const origin: ProposalRow["origin"] = ai.mode === "live" ? "ai" : "rules";
    for (const a of rep.accepted) {
      db.prepare("INSERT INTO fact_proposals (id, session_id, turn_id, slot, subject, value, quote, needs_confirmation, origin, validation, state, invocation_id, created_at) VALUES (?,?,?,?,?,?,?,1,?,'accepted','proposed',?,?)").run(nextId(db, "PRP"), s.id, prep.turn.id, a.slot, subject, a.value, a.source_quote, origin, ai.invocation_id, now);
    }
    for (const r of rep.rejected) {
      db.prepare("INSERT INTO fact_proposals (id, session_id, turn_id, slot, subject, value, quote, needs_confirmation, origin, validation, reject_reason, state, invocation_id, created_at, resolved_at) VALUES (?,?,?,?,?,?,?,1,?,'rejected',?,'dismissed',?,?,?)").run(nextId(db, "PRP"), s.id, prep.turn.id, r.slot, subject, r.value, r.quote.slice(0, 400), origin, r.reason, ai.invocation_id, now, now);
    }
    db.prepare("UPDATE survey_sessions SET ai_mode_last = ? WHERE id = ?").run(ai.mode, s.id);
    if (rep.needs_human_help) openHelp(db, p, s, "tanda_mendesak_pada_jawaban");
    appendAudit(db, { ...A(p), action: "jawaban_teks_diterima", entity: "survey_turn", entity_id: prep.turn.id, detail: { sesi: s.id, mode_ai: ai.mode, diusulkan: rep.accepted.length, ditolak_validator: rep.rejected.length, invocation: ai.invocation_id } });
    if (!rep.accepted.length) {
      // tidak ada yang dapat ditangkap: minta peserta memilih; setelah dua kali, teks dimatikan untuk pertanyaan ini
      db.prepare("UPDATE survey_turns SET answer_text = ?, attempts = attempts + 1, needs_rephrase = 1, idem_key = NULL WHERE id = ?").run(prep.text, prep.turn.id);
      bump(db, s.id);
      return buildView(db, mustSession(db, s.id), "Saya belum bisa menangkap jawaban itu dengan pasti. Silakan pilih salah satu jawaban di bawah, atau tulis dengan kalimat lain.");
    }
    db.prepare("UPDATE survey_turns SET answer_text = ?, answered_at = ?, status = 'answered', idem_key = ? WHERE id = ?").run(prep.text, now, inp.idem_key ?? prep.turn.idem_key, prep.turn.id);
    db.prepare("UPDATE survey_sessions SET pending_next_json = ? WHERE id = ?").run(JSON.stringify(hintFrom(ai)), s.id);
    bump(db, s.id);
    return buildView(db, mustSession(db, s.id));
  })();
}

/** Versi asinkron: boleh memanggil penyedia AI langsung (bila dikonfigurasi). Kegagalan AI → fallback deterministik, sesi tetap berjalan. */
export async function submitAnswer(db: Database.Database, p: Principal, inp: AnswerInput, opts: { fault?: Fault | null } = {}): Promise<SessionView> {
  const prep = prepareAnswer(db, p, inp);
  if (prep.replay) return buildView(db, mustSession(db, prep.s.id));
  try {
    if (prep.kind === "choice") {
      const ai = prep.s.bank_mode === "adaptive_clarify" && prep.aiInput.candidate_questions.length ? await runInterview(db, prep.aiInput, { fault: opts.fault ?? null }) : null;
      return applyChoice(db, p, prep, ai, inp);
    }
    const ai = await runInterview(db, prep.aiInput, { fault: opts.fault ?? null });
    return applyText(db, p, prep, ai, inp);
  } catch (e) {
    releaseClaim(db, prep.turn.id);
    throw e;
  }
}

/** Versi sinkron untuk seed dan tes deterministik: tidak pernah memakai jaringan. */
export function submitAnswerSync(db: Database.Database, p: Principal, inp: AnswerInput, opts: { fault?: Fault | null } = {}): SessionView {
  const prep = prepareAnswer(db, p, inp);
  if (prep.replay) return buildView(db, mustSession(db, prep.s.id));
  try {
    if (prep.kind === "choice") {
      const ai = prep.s.bank_mode === "adaptive_clarify" && prep.aiInput.candidate_questions.length ? runInterviewSimulated(db, prep.aiInput, { fault: opts.fault ?? null }) : null;
      return applyChoice(db, p, prep, ai, inp);
    }
    return applyText(db, p, prep, runInterviewSimulated(db, prep.aiInput, { fault: opts.fault ?? null }), inp);
  } catch (e) {
    releaseClaim(db, prep.turn.id);
    throw e;
  }
}

/* ---------- Konfirmasi / koreksi usulan ---------- */
export interface ResolveInput {
  session_id: string;
  proposal_id: string;
  action: "confirm" | "correct" | "dismiss";
  value?: string;
  revision: number;
  idem_key?: string;
}

export function resolveProposal(db: Database.Database, p: Principal, inp: ResolveInput): SessionView {
  const r = idempotent(db, `survey.resolve:${inp.session_id}`, inp.idem_key, () =>
    db.transaction(() => {
      const s = mustSession(db, inp.session_id);
      authSession(db, p, s, true);
      if (s.status !== "active") throw new DomainError(`Sesi sudah ${SESSION_LABEL[s.status].toLowerCase()}.`, 409, "session_closed");
      checkRevision(s, inp.revision);
      const pr = db.prepare("SELECT * FROM fact_proposals WHERE id = ? AND session_id = ?").get(inp.proposal_id, s.id) as ProposalRow | undefined;
      if (!pr) throw new DomainError("Usulan tidak ditemukan.", 404);
      if (pr.state !== "proposed") throw new DomainError("Usulan ini sudah diputuskan.", 409, "already_resolved");
      const L = load(db, s);
      const now = nowPrecise();
      if (inp.action === "dismiss") {
        db.prepare("UPDATE fact_proposals SET state = 'dismissed', resolved_at = ? WHERE id = ?").run(now, pr.id);
      } else {
        let value = pr.value;
        if (inp.action === "correct") {
          const allowed = [...(slotDef(L, pr.slot)?.def.values ?? []), "unknown"];
          if (!inp.value || !allowed.includes(inp.value)) throw new DomainError("Nilai koreksi tidak sah untuk hal ini.", 422);
          value = inp.value;
        }
        const fid = insertFact(db, L, { slot: pr.slot, value, turn_id: pr.turn_id, quote: pr.quote, origin: inp.action === "confirm" ? "confirmed_proposal" : "correction", proposal_id: pr.id });
        db.prepare("UPDATE fact_proposals SET state = ?, resolved_at = ? WHERE id = ?").run(inp.action === "confirm" ? "confirmed" : "corrected", now, pr.id);
        appendAudit(db, { ...A(p), action: inp.action === "confirm" ? "usulan_dikonfirmasi" : "usulan_dikoreksi", entity: "fact_proposal", entity_id: pr.id, detail: { sesi: s.id, slot: pr.slot, nilai_usulan: pr.value, nilai_akhir: value, fakta: fid } });
      }
      if (inp.action === "dismiss") appendAudit(db, { ...A(p), action: "usulan_ditolak_peserta", entity: "fact_proposal", entity_id: pr.id, detail: { sesi: s.id, slot: pr.slot } });
      bump(db, s.id);
      const left = db.prepare("SELECT COUNT(*) n FROM fact_proposals WHERE session_id = ? AND state = 'proposed'").get(s.id) as { n: number };
      if (left.n === 0) advance(db, s, json<PendingNext | null>(s.pending_next_json, null), p);
      return s.id;
    })(),
  );
  return buildView(db, mustSession(db, r.value));
}

/* ---------- Koreksi fakta yang sudah tercatat ---------- */
export function correctFact(db: Database.Database, p: Principal, inp: { session_id: string; fact_id: string; value: string; revision: number; idem_key?: string }): SessionView {
  const r = idempotent(db, `survey.correct:${inp.session_id}`, inp.idem_key, () =>
    db.transaction(() => {
      const s = mustSession(db, inp.session_id);
      authSession(db, p, s, true);
      if (s.status !== "active") throw new DomainError("Koreksi hanya dapat dilakukan selama sesi berjalan. Setelah selesai, gunakan 'Lapor kendala'.", 409, "session_closed");
      checkRevision(s, inp.revision);
      if (db.prepare("SELECT 1 FROM fact_proposals WHERE session_id = ? AND state = 'proposed' LIMIT 1").get(s.id)) throw new DomainError("Putuskan dulu usulan yang menunggu konfirmasi.", 409, "review_pending");
      const f = db.prepare("SELECT * FROM participant_facts WHERE id = ? AND session_id = ?").get(inp.fact_id, s.id) as FactRow | undefined;
      if (!f || f.status !== "active") throw new DomainError("Jawaban yang akan dikoreksi tidak ditemukan.", 404);
      const L = load(db, s);
      const allowed = [...(slotDef(L, f.slot)?.def.values ?? []), "unknown"];
      if (!allowed.includes(inp.value)) throw new DomainError("Nilai koreksi tidak sah untuk hal ini.", 422);
      if (inp.value === f.value) return s.id;
      const id = insertFact(db, L, { slot: f.slot, value: inp.value, turn_id: f.source_turn_id, quote: f.source_quote, origin: "correction" });
      appendAudit(db, { ...A(p), action: "jawaban_dikoreksi", entity: "participant_fact", entity_id: id, detail: { sesi: s.id, slot: f.slot, dari: f.value, ke: inp.value, menggantikan: f.id } });
      bump(db, s.id);
      return s.id;
    })(),
  );
  return buildView(db, mustSession(db, r.value));
}

/* ---------- Berhenti dan kedaluwarsa ---------- */
export function stopSession(db: Database.Database, p: Principal, inp: { session_id: string; revision: number; idem_key?: string }): SessionView {
  const r = idempotent(db, `survey.stop:${inp.session_id}`, inp.idem_key, () =>
    db.transaction(() => {
      const s = mustSession(db, inp.session_id);
      authSession(db, p, s, true);
      if (s.status !== "active") return s.id;
      checkRevision(s, inp.revision);
      const L = load(db, s);
      // usulan yang belum dikonfirmasi tidak menjadi fakta
      db.prepare("UPDATE fact_proposals SET state = 'dismissed', resolved_at = ? WHERE session_id = ? AND state = 'proposed'").run(nowPrecise(), s.id);
      finish(db, L, agendaOf(L), L.factRows.length ? "partial" : "cancelled", "participant_stopped", p);
      return s.id;
    })(),
  );
  return buildView(db, mustSession(db, r.value));
}

/** Menutup sesi dan undangan yang lewat tenggat. Fakta yang sudah dikonfirmasi tetap dipakai (tidak ada yang dihapus). */
export function expireStale(db: Database.Database, by: Actor = SYSTEM_ACTOR, now: string = nowIso()) {
  let sessions = 0;
  let invitations = 0;
  db.transaction(() => {
    const rows = db.prepare("SELECT * FROM survey_sessions WHERE status = 'active' AND deadline_at IS NOT NULL AND deadline_at < ?").all(now) as SessionRow[];
    for (const s of rows) {
      db.prepare("UPDATE fact_proposals SET state = 'dismissed', resolved_at = ? WHERE session_id = ? AND state = 'proposed'").run(nowPrecise(), s.id);
      const L = load(db, s);
      finish(db, L, null, "expired", "expired", by);
      sessions++;
    }
    const inv = db.prepare("UPDATE invitations SET status = 'expired' WHERE status IN ('scheduled','sent','opened') AND expires_at IS NOT NULL AND expires_at < ? AND (session_id IS NULL OR session_id NOT IN (SELECT id FROM survey_sessions WHERE status = 'active'))").run(now);
    invitations = inv.changes;
    if (sessions || invitations) appendAudit(db, { ...A(by), action: "kedaluwarsa_diproses", entity: "survey_session", entity_id: "batch", detail: { sesi: sessions, undangan: invitations } });
  })();
  return { sessions, invitations };
}
