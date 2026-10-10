import type Database from "better-sqlite3";
import { assertCan, assertFacility, AuthError, type Principal } from "../auth/principal";
import { assertCaseAccess, getCase, getFinding, type CaseRow, type FindingRow } from "../cases/core";
import { dayOf } from "../dates";
import { json } from "../db";
import { PROOF_FINAL } from "../domain/transitions";
import { DomainError } from "../idem";
import { ANSWER_LABEL, FINDING_LABEL } from "../labels";
import { isMetaValue } from "../survey/engine";
import { buildPack, packFingerprint, type EvidencePack } from "./pack";
import { FACILITY_VISIBLE_SQL, findingVisibleToFacility } from "./workflow";
import { latestSummary, rowToSuggestion, type SuggestionRow, type SummaryRow } from "./summary";
import { SLOT_LABEL, TIMELINE_KIND_LABEL } from "./labels";

/* Kueri baca modul kasus-faskes. Semua fungsi menerima `db` dan `Principal`, dan memeriksa wewenang sendiri.
   Bagian konsol (antrean, ruang kasus, asisten) hanya untuk staf; bagian faskes selalu dibatasi ke faskes pemanggil. */

export const PAGE_SIZE = 15;
/** Batas minimum responden sebelum agregat survei ditampilkan ke faskes (mencegah identifikasi individu). */
export const MIN_N_FACILITY = 5;

const placeholders = (n: number) => Array.from({ length: n }, () => "?").join(",");

/* ====================================================================== Antrean konsol */
export interface QueueFilters {
  q?: string; source?: string; stage?: string; facility?: string; assignee?: string; priority?: string; page?: number; sort?: string;
}
export interface QueueRow {
  finding_id: string; case_id: string; title: string; type: FindingRow["type"]; source: string; facility_id: string; facility_name: string; proof_status: FindingRow["proof_status"];
  priority: number; score: number; assignee_id: string | null; lifecycle: string; claim_no: string | null; updated_at: string; due_at: string | null;
  open_clarifications: number; open_disputes: number;
}
export interface Paged<T> { rows: T[]; total: number; page: number; pages: number }

export function proofQueue(db: Database.Database, p: Principal, f: QueueFilters = {}): Paged<QueueRow> {
  assertCan(p, "case.view");
  const where: string[] = [];
  const args: unknown[] = [];
  const stage = f.stage ?? "active";
  if (stage === "active") where.push("f.proof_status NOT IN ('verified','not_verified','inconclusive')");
  else if (stage === "final") where.push("f.proof_status IN ('verified','not_verified','inconclusive')");
  else if (stage !== "all") { where.push("f.proof_status = ?"); args.push(stage); }
  if (f.source) { where.push("f.source = ?"); args.push(f.source); }
  if (f.facility) { where.push("f.facility_id = ?"); args.push(f.facility); }
  if (f.assignee === "none") where.push("c.assignee_id IS NULL");
  else if (f.assignee) { where.push("c.assignee_id = ?"); args.push(f.assignee); }
  if (f.priority) { where.push("c.priority = ?"); args.push(Number(f.priority)); }
  if (f.q?.trim()) {
    where.push("(f.id LIKE ? OR f.title LIKE ? OR cl.claim_no LIKE ? OR fa.name LIKE ?)");
    const like = `%${f.q.trim()}%`;
    args.push(like, like, like, like);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const order = f.sort === "updated" ? "f.updated_at DESC" : f.sort === "score" ? "f.score DESC, c.priority ASC" : "c.priority ASC, f.score DESC, f.updated_at DESC";
  const from = "FROM findings f JOIN cases c ON c.id = f.case_id JOIN facilities fa ON fa.id = f.facility_id LEFT JOIN claims cl ON cl.id = f.claim_id";
  const total = (db.prepare(`SELECT COUNT(*) n ${from} ${w}`).get(...args) as { n: number }).n;
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const rows = db.prepare(
    `SELECT f.id finding_id, f.case_id, f.title, f.type, f.source, f.facility_id, fa.name facility_name, f.proof_status, c.priority, f.score, c.assignee_id, c.lifecycle, cl.claim_no, f.updated_at, c.due_at,
       (SELECT COUNT(*) FROM clarifications k WHERE k.finding_id = f.id AND k.status = 'sent') open_clarifications,
       (SELECT COUNT(*) FROM disputes d WHERE d.kind = 'finding' AND d.ref_id = f.id AND d.status = 'open') open_disputes
     ${from} ${w} ORDER BY ${order} LIMIT ? OFFSET ?`,
  ).all(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE) as QueueRow[];
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export interface ActionQueueFilters { status?: string; facility?: string; overdue?: string; page?: number }
export interface ActionQueueRow {
  id: string; description: string; owner: string | null; target_date: string | null; status: string; facility_id: string; facility_name: string; finding_id: string | null; case_id: string | null;
  finding_title: string | null; overdue: boolean; pending_followups: number; created_at: string;
}
export function actionQueue(db: Database.Database, p: Principal, f: ActionQueueFilters = {}, today = new Date().toISOString().slice(0, 10)): Paged<ActionQueueRow> {
  assertCan(p, "case.view");
  const where: string[] = [];
  const args: unknown[] = [];
  const status = f.status ?? "active";
  if (status === "active") where.push("a.status <> 'closed'");
  else if (status !== "all") { where.push("a.status = ?"); args.push(status); }
  if (f.facility) { where.push("a.facility_id = ?"); args.push(f.facility); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = (db.prepare(`SELECT COUNT(*) n FROM improvement_actions a ${w}`).get(...args) as { n: number }).n;
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const rows = db.prepare(
    `SELECT a.id, a.description, a.owner, a.target_date, a.status, a.facility_id, fa.name facility_name, a.finding_id, a.case_id, fi.title finding_title, a.created_at,
       (SELECT COUNT(*) FROM follow_ups u WHERE u.action_id = a.id AND u.status = 'pending') pending_followups
     FROM improvement_actions a JOIN facilities fa ON fa.id = a.facility_id LEFT JOIN findings fi ON fi.id = a.finding_id ${w}
     ORDER BY CASE a.status WHEN 'follow_up_pending' THEN 0 WHEN 'resolved' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'open' THEN 3 ELSE 4 END, a.target_date LIMIT ? OFFSET ?`,
  ).all(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE) as Omit<ActionQueueRow, "overdue">[];
  let out = rows.map((r) => ({ ...r, overdue: r.status !== "closed" && r.status !== "resolved" && r.status !== "follow_up_pending" && !!r.target_date && dayOf(r.target_date) < today }));
  if (f.overdue === "1") out = out.filter((r) => r.overdue);
  return { rows: out, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export function queueFacets(db: Database.Database) {
  return {
    facilities: db.prepare("SELECT id, name FROM facilities WHERE is_demo = 1 ORDER BY name").all() as { id: string; name: string }[],
    assignees: db.prepare("SELECT role || ':' || id id, name, role FROM users WHERE role IN ('verifikator','reviewer') ORDER BY role DESC, name").all() as { id: string; name: string; role: string }[],
    sources: db.prepare("SELECT DISTINCT source FROM findings ORDER BY source").all().map((r) => (r as { source: string }).source),
  };
}

export function queueCounts(db: Database.Database) {
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    active: n("SELECT COUNT(*) n FROM findings WHERE proof_status NOT IN ('verified','not_verified','inconclusive')"),
    signal: n("SELECT COUNT(*) n FROM findings WHERE proof_status = 'signal'"),
    awaiting: n("SELECT COUNT(*) n FROM findings WHERE proof_status = 'awaiting_clarification'"),
    disputes: n("SELECT COUNT(*) n FROM disputes WHERE kind = 'finding' AND status = 'open'"),
    pendingProposals: n("SELECT COUNT(*) n FROM review_decisions WHERE kind = 'proof_proposal' AND state = 'pending'"),
    pendingEscalations: n("SELECT COUNT(*) n FROM review_decisions WHERE kind = 'escalation' AND state = 'pending'"),
    actionsOpen: n("SELECT COUNT(*) n FROM improvement_actions WHERE status <> 'closed'"),
    suggestions: n("SELECT COUNT(*) n FROM assistant_suggestions WHERE state = 'proposed'"),
  };
}

/* ====================================================================== Ruang kasus */
export interface TimelineItem { at: string; kind: string; kindLabel: string; text: string; actor?: string | null }
export interface DecisionRow { id: number; kind: string; decision: string | null; reason: string | null; correction_amount: number | null; actor_id: string; actor_role: string; state: string; ref_id: number | null; simulated: number; at: string }
export interface DisputeRow { id: string; facility_id: string; ref_id: string; text: string; status: string; response: string | null; created_by: string | null; created_at: string; resolved_by: string | null; resolved_at: string | null }
export interface ActionRow {
  id: string; finding_id: string | null; description: string; owner: string | null; target_date: string | null; status: string; result: string | null; remeasure_plan: string | null; created_by: string | null; created_at: string;
  started_at: string | null; resolved_at: string | null; closed_at: string | null; followups: { id: string; kind: string; due_at: string | null; status: string; outcome: string | null; note: string | null; participant_id: string | null }[];
}
export interface NoteRow { id: number; finding_id: string | null; author_id: string; author_role: string; text: string; at: string }

export interface FindingRoom {
  finding: FindingRow;
  pack: EvidencePack;
  summary: SummaryRow | null;
  summaryStale: boolean;
  suggestions: SuggestionRow[];
  decisions: DecisionRow[];
  pendingProposal: DecisionRow | null;
  pendingEscalation: DecisionRow | null;
  causes: string[];
  disputes: DisputeRow[];
  canClaimReview: boolean;
  claimReviews: DecisionRow[];
}
export interface CaseRoom {
  case: CaseRow;
  facility: { id: string; name: string; kind: string; class: string | null; region: string | null };
  assignments: { assignee_id: string; assigned_by: string; reason: string | null; priority_basis: string | null; at: string }[];
  findings: FindingRoom[];
  actions: ActionRow[];
  notes: NoteRow[];
  timeline: TimelineItem[];
  assignees: { id: string; name: string; role: string }[];
  episodeParticipantRef: string;
}

export function getCaseRoom(db: Database.Database, p: Principal, caseId: string): CaseRoom {
  assertCan(p, "case.view");
  const c = getCase(db, caseId);
  if (!c) throw new DomainError("Kasus tidak ditemukan.", 404);
  assertCaseAccess(p, c.facility_id);
  const facility = db.prepare("SELECT id, name, kind, class, region FROM facilities WHERE id = ?").get(c.facility_id) as CaseRoom["facility"];
  const frows = db.prepare("SELECT * FROM findings WHERE case_id = ? ORDER BY created_at, id").all(caseId) as FindingRow[];
  const findings: FindingRoom[] = frows.map((f) => {
    const pack = buildPack(db, f);
    const summary = latestSummary(db, f.id);
    const sugs = (db.prepare("SELECT * FROM assistant_suggestions WHERE finding_id = ? ORDER BY created_at DESC, id DESC LIMIT 40").all(f.id) as Record<string, unknown>[]).map(rowToSuggestion);
    const decisions = db.prepare("SELECT id, kind, decision, reason, correction_amount, actor_id, actor_role, state, ref_id, simulated, at FROM review_decisions WHERE finding_id = ? ORDER BY id").all(f.id) as DecisionRow[];
    return {
      finding: f, pack, summary, summaryStale: !!summary && summary.fingerprint !== packFingerprint(pack), suggestions: sugs, decisions,
      pendingProposal: [...decisions].reverse().find((d) => d.kind === "proof_proposal" && d.state === "pending") ?? null,
      pendingEscalation: [...decisions].reverse().find((d) => d.kind === "escalation" && d.state === "pending") ?? null,
      causes: json<string[]>(f.causes_json, []),
      disputes: db.prepare("SELECT id, facility_id, ref_id, text, status, response, created_by, created_at, resolved_by, resolved_at FROM disputes WHERE kind = 'finding' AND ref_id = ? ORDER BY created_at").all(f.id) as DisputeRow[],
      canClaimReview: !!f.claim_id && PROOF_FINAL.includes(f.proof_status),
      claimReviews: decisions.filter((d) => d.kind === "claim_review"),
    };
  });
  const actions = (db.prepare("SELECT * FROM improvement_actions WHERE case_id = ? ORDER BY created_at, id").all(caseId) as (Omit<ActionRow, "followups">)[]).map((a) => ({
    ...a, followups: db.prepare("SELECT id, kind, due_at, status, outcome, note, participant_id FROM follow_ups WHERE action_id = ? ORDER BY created_at, id").all(a.id) as ActionRow["followups"],
  }));
  const notes = db.prepare("SELECT id, finding_id, author_id, author_role, text, at FROM case_notes WHERE case_id = ? ORDER BY id DESC LIMIT 100").all(caseId) as NoteRow[];
  const assignments = db.prepare("SELECT assignee_id, assigned_by, reason, priority_basis, at FROM assignments WHERE case_id = ? ORDER BY id").all(caseId) as CaseRoom["assignments"];
  const assignees = db.prepare("SELECT role || ':' || id id, name, role FROM users WHERE role IN ('verifikator','reviewer') ORDER BY role DESC, name").all() as CaseRoom["assignees"];
  return { case: c, facility, assignments, findings, actions, notes, timeline: buildTimeline(db, c, findings, actions), assignees, episodeParticipantRef: c.episode_id };
}

/* ---------- Linimasa ---------- */
const AUDIT_KIND: [RegExp, string][] = [
  [/^(klarifikasi)/, "clarification"], [/^(bukti|pencarian|dokumen)/, "evidence"], [/^(usulan|status_pembuktian|penyebab|eskalasi|keputusan_klaim|ringkasan_ai|saran_asisten)/, "proof"],
  [/^(tindakan|tindak_lanjut)/, "action"], [/^bantahan/, "dispute"], [/^(kasus|catatan)/, "case"],
];
const AUDIT_TEXT: Record<string, string> = {
  kasus_ditugaskan: "Kasus ditugaskan", kasus_ditutup: "Kasus ditutup", kasus_dibuka_ulang: "Kasus dibuka ulang", catatan_internal_ditambah: "Catatan internal ditambahkan",
  status_pembuktian: "Status pembuktian berubah", usulan_pembuktian: "Usulan hasil pembuktian diajukan", usulan_pembuktian_ditolak: "Usulan hasil pembuktian ditolak reviewer",
  penyebab_ditetapkan: "Penyebab ditetapkan", eskalasi_diminta: "Permintaan eskalasi diajukan", eskalasi_disetujui: "Eskalasi disetujui (label dugaan, bukan putusan)", eskalasi_ditolak: "Eskalasi ditolak",
  keputusan_klaim_dicatat_simulasi: "Keputusan klaim dicatat sebagai simulasi", ringkasan_ai_dibuat: "Ringkasan asisten dibuat", ringkasan_ai_dikoreksi: "Ringkasan asisten dikoreksi petugas",
  saran_asisten_diputuskan: "Saran asisten diputuskan petugas", klarifikasi_dikirim: "Klarifikasi dikirim ke faskes", klarifikasi_dijawab: "Faskes menjawab klarifikasi",
  klarifikasi_lewat_tenggat: "Klarifikasi melewati tenggat (tidak membuktikan apa pun)", klarifikasi_ditarik: "Klarifikasi ditarik petugas", bukti_ditautkan: "Bukti ditautkan ke temuan",
  pencarian_bukti_dicatat: "Pencarian bukti dicatat", dokumen_diunggah: "Dokumen diunggah", tindakan_dibuat: "Tindakan perbaikan dibuat", tindakan_dimulai: "Tindakan perbaikan dimulai",
  tindakan_selesai_dikerjakan: "Tindakan perbaikan selesai dikerjakan", tindak_lanjut_diminta: "Tindak lanjut diminta", tindak_lanjut_selesai: "Tindak lanjut selesai", tindakan_ditutup: "Tindakan ditutup",
  tindakan_dibuka_kembali: "Tindakan dibuka kembali", bantahan_diajukan: "Faskes mengajukan bantahan", bantahan_ditanggapi: "Bantahan ditanggapi",
};

function buildTimeline(db: Database.Database, c: CaseRow, findings: FindingRoom[], actions: ActionRow[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  const add = (at: string | null | undefined, kind: string, text: string, actor?: string | null) => { if (at) out.push({ at, kind, kindLabel: TIMELINE_KIND_LABEL[kind] ?? kind, text, actor }); };
  const pack = findings[0]?.pack;
  if (pack) {
    add(pack.episode.admit_at, "episode", `Perawatan ${pack.episode.kind === "RITL" ? "rawat inap" : "rawat jalan"} dimulai${pack.episode.dx_text ? ` (${pack.episode.dx_text})` : ""}.`);
    add(pack.episode.discharge_at, "episode", "Perawatan selesai.");
    for (const s of pack.services) add(s.performed_at, "service", `${s.name} (${s.code}) tercantum pada rincian${s.needs_record ? (s.state === "tersedia" ? "; catatan pelaksanaan tertaut" : "; catatan pelaksanaan belum selaras") : ""}.`);
    for (const r of pack.records) add(r.recorded_at, "record", `Catatan pelaksanaan: ${r.summary}`);
    if (pack.claim) {
      add(pack.claim.submitted_at, "claim", `Klaim ${pack.claim.claim_no} diajukan.`);
      add(pack.claim.paid_at, "claim", `Klaim ${pack.claim.claim_no} dibayar.`);
    }
  }
  const seen = new Set<string>();
  for (const f of findings) {
    for (const x of f.pack.facts) {
      if (seen.has(x.id)) continue;
      seen.add(x.id);
      const v = ANSWER_LABEL[x.value] ?? x.value.replaceAll("_", " ");
      add(x.created_at, "survey", `${x.respondent_role === "companion" ? "Pendamping" : "Peserta"} menjawab "${v}" untuk ${SLOT_LABEL[x.slot] ?? x.slot.replaceAll("_", " ")}${isMetaValue(x.value) ? " (bernilai nol)" : ""}.`);
    }
    for (const r of f.pack.requests) if (!seen.has(r.id)) { seen.add(r.id); add(r.created_at, "survey", `Peserta melaporkan kendala layanan (${r.category}).`); }
    add(f.finding.created_at, "case", `Temuan ${f.finding.id} dibuat dari ${f.finding.source === "claim_engine" ? "pencocokan episode dan klaim" : "sumber lain"}.`);
  }
  add(c.opened_at, "case", `Kasus ${c.id} dibuka.`);
  // audit: semua entri pada entitas yang menjadi bagian kasus
  const ids = new Set<string>([c.id, ...findings.map((f) => f.finding.id), ...actions.map((a) => a.id), ...actions.flatMap((a) => a.followups.map((u) => u.id))]);
  for (const f of findings) {
    for (const k of f.pack.clarifications) ids.add(k.id);
    for (const d of f.pack.documents) ids.add(d.id);
    for (const d of f.disputes) ids.add(d.id);
  }
  const list = [...ids];
  const rows = list.length ? (db.prepare(`SELECT ts, actor, action, entity_id, detail FROM audit_log WHERE entity_id IN (${placeholders(list.length)}) ORDER BY id`).all(...list) as { ts: string; actor: string; action: string; entity_id: string; detail: string }[]) : [];
  for (const r of rows) {
    if (r.action === "kasus_dibuat" || r.action === "temuan_dibuat") continue;
    const kind = AUDIT_KIND.find(([re]) => re.test(r.action))?.[1] ?? "case";
    const d = json<Record<string, unknown>>(r.detail, {});
    let extra = "";
    if (r.action === "status_pembuktian" && d.ke) extra = `: ${String(d.dari ?? "")} → ${String(d.ke)}`.replace("signal", "Sinyal").replace("under_review", "Sedang ditinjau").replace("awaiting_clarification", "Menunggu klarifikasi").replace("verified", "Terbukti").replace("not_verified", "Tidak terbukti").replace("inconclusive", "Tidak dapat dibuktikan");
    add(r.ts, kind, `${AUDIT_TEXT[r.action] ?? r.action.replaceAll("_", " ")}${extra}.`, r.actor);
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/* ====================================================================== Asisten AI (peninjauan) */
export interface InboxRow extends SuggestionRow { finding_title: string; facility_name: string; proof_status: string; summary_mode: string }
export function assistantInbox(db: Database.Database, p: Principal) {
  assertCan(p, "ai.view");
  const pending = (db.prepare(
    `SELECT s.*, f.title finding_title, fa.name facility_name, f.proof_status, cs.mode summary_mode
     FROM assistant_suggestions s JOIN findings f ON f.id = s.finding_id JOIN facilities fa ON fa.id = f.facility_id JOIN case_summaries cs ON cs.id = s.summary_id
     WHERE s.state = 'proposed' ORDER BY s.created_at DESC, s.id DESC LIMIT 60`,
  ).all() as Record<string, unknown>[]).map((r) => ({ ...rowToSuggestion(r), finding_title: r.finding_title as string, facility_name: r.facility_name as string, proof_status: r.proof_status as string, summary_mode: r.summary_mode as string }));
  const decided = db.prepare("SELECT state, COUNT(*) n FROM assistant_suggestions WHERE state <> 'proposed' GROUP BY state").all() as { state: string; n: number }[];
  const byKind = db.prepare("SELECT kind, state, COUNT(*) n FROM assistant_suggestions GROUP BY kind, state").all() as { kind: string; state: string; n: number }[];
  const recent = (db.prepare(
    `SELECT s.*, f.title finding_title, fa.name facility_name, f.proof_status, cs.mode summary_mode
     FROM assistant_suggestions s JOIN findings f ON f.id = s.finding_id JOIN facilities fa ON fa.id = f.facility_id JOIN case_summaries cs ON cs.id = s.summary_id
     WHERE s.state IN ('accepted','modified','dismissed') ORDER BY s.decided_at DESC LIMIT 20`,
  ).all() as Record<string, unknown>[]).map((r) => ({ ...rowToSuggestion(r), finding_title: r.finding_title as string, facility_name: r.facility_name as string, proof_status: r.proof_status as string, summary_mode: r.summary_mode as string }));
  const summaries = db.prepare("SELECT mode, COUNT(*) n FROM case_summaries GROUP BY mode").all() as { mode: string; n: number }[];
  const withoutSummary = db.prepare(
    `SELECT f.id, f.title, fa.name facility_name, f.proof_status FROM findings f JOIN facilities fa ON fa.id = f.facility_id
     WHERE f.proof_status NOT IN ('verified','not_verified','inconclusive') AND NOT EXISTS (SELECT 1 FROM case_summaries cs WHERE cs.finding_id = f.id) ORDER BY f.priority, f.score DESC LIMIT 12`,
  ).all() as { id: string; title: string; facility_name: string; proof_status: string }[];
  return { pending, decided, byKind, recent, summaries, withoutSummary };
}

/* ====================================================================== Portal faskes */
function facilityOf(p: Principal) {
  if (p.role !== "faskes" || !p.facilityId) throw new AuthError("Portal ini hanya untuk petugas faskes.");
  return p.facilityId;
}

/** Bagian temuan yang boleh dilihat faskes. Tanpa skor, rincian sinyal, identitas atau jawaban peserta, catatan internal, ringkasan asisten, atau label eskalasi. */
export interface FacilityFinding {
  id: string; case_id: string; title: string; type_label: string; proof_status: FindingRow["proof_status"]; claim_no: string | null; admit_date: string; causes: string[]; causes_note: string | null;
  updated_at: string; open_clarification_ids: string[]; has_open_dispute: boolean;
}
function toFacilityFinding(db: Database.Database, f: FindingRow): FacilityFinding {
  const ep = db.prepare("SELECT admit_at FROM episodes WHERE id = ?").get(f.episode_id) as { admit_at: string };
  const cl = f.claim_id ? (db.prepare("SELECT claim_no FROM claims WHERE id = ?").get(f.claim_id) as { claim_no: string } | undefined) : undefined;
  // judul dari sumber survei dapat memuat informasi turunan jawaban peserta; faskes hanya melihat label jenis dan butir standar
  const surveyDerived = f.source === "survey_routine" || f.source === "survey_directed" || f.source === "participant_report";
  const ind = surveyDerived && f.indicator_id ? (db.prepare("SELECT title FROM indicator_versions WHERE id = ? OR indicator_id = ? ORDER BY version DESC LIMIT 1").get(f.indicator_id, f.indicator_id) as { title: string } | undefined) : undefined;
  const title = surveyDerived ? (ind ? `${FINDING_LABEL[f.type].short}: ${ind.title}` : FINDING_LABEL[f.type].short) : f.title;
  return {
    id: f.id, case_id: f.case_id, title, type_label: FINDING_LABEL[f.type].short, proof_status: f.proof_status, claim_no: cl?.claim_no ?? null, admit_date: dayOf(ep.admit_at),
    causes: json<string[]>(f.causes_json, []).filter((x) => x !== "suspected_fraud"), causes_note: f.proof_status === "verified" ? f.causes_note : null, updated_at: f.updated_at,
    open_clarification_ids: (db.prepare("SELECT id FROM clarifications WHERE finding_id = ? AND status IN ('sent','lapsed')").all(f.id) as { id: string }[]).map((x) => x.id),
    has_open_dispute: !!db.prepare("SELECT 1 FROM disputes WHERE kind = 'finding' AND ref_id = ? AND status = 'open'").get(f.id),
  };
}

export function facilityHome(db: Database.Database, p: Principal, today = new Date().toISOString().slice(0, 10)) {
  assertCan(p, "facility.respond");
  const fid = facilityOf(p);
  const n = (sql: string) => (db.prepare(sql).get(fid) as { n: number }).n;
  const findings = (db.prepare(`SELECT f.* FROM findings f WHERE f.facility_id = ? AND ${FACILITY_VISIBLE_SQL} ORDER BY f.updated_at DESC LIMIT 8`).all(fid) as FindingRow[]).map((f) => toFacilityFinding(db, f));
  return {
    facility: db.prepare("SELECT id, name, kind, class, region FROM facilities WHERE id = ?").get(fid) as { id: string; name: string; kind: string; class: string | null; region: string | null },
    waiting: n("SELECT COUNT(*) n FROM clarifications WHERE facility_id = ? AND status = 'sent'"),
    lapsed: n("SELECT COUNT(*) n FROM clarifications WHERE facility_id = ? AND status = 'lapsed'"),
    answered: n("SELECT COUNT(*) n FROM clarifications WHERE facility_id = ? AND status = 'answered'"),
    disputesOpen: n("SELECT COUNT(*) n FROM disputes WHERE facility_id = ? AND kind = 'finding' AND status = 'open'"),
    actionsOpen: n("SELECT COUNT(*) n FROM improvement_actions WHERE facility_id = ? AND status <> 'closed'"),
    actionsOverdue: (db.prepare("SELECT target_date FROM improvement_actions WHERE facility_id = ? AND status IN ('open','in_progress')").all(fid) as { target_date: string | null }[]).filter((a) => a.target_date && dayOf(a.target_date) < today).length,
    findings,
  };
}

export interface FacilityClarification {
  id: string; finding_id: string | null; finding_title: string; status: string; issue: string; requested_docs: string[]; minimal_ref: string | null; due_at: string; sent_at: string; answered_at: string | null; doc_count: number;
}
export function facilityClarifications(db: Database.Database, p: Principal): FacilityClarification[] {
  assertCan(p, "facility.respond");
  const fid = facilityOf(p);
  const rows = db.prepare("SELECT * FROM clarifications WHERE facility_id = ? AND status <> 'withdrawn' ORDER BY CASE status WHEN 'sent' THEN 0 WHEN 'lapsed' THEN 1 ELSE 2 END, due_at").all(fid) as (Record<string, unknown> & { id: string; finding_id: string | null })[];
  return rows.map((c) => {
    const f = c.finding_id ? getFinding(db, c.finding_id) : undefined;
    return {
      id: c.id, finding_id: c.finding_id, finding_title: f ? toFacilityFinding(db, f).title : "-", status: c.status as string, issue: c.issue as string, requested_docs: json<string[]>(c.requested_docs_json as string, []),
      minimal_ref: (c.minimal_ref as string) ?? null, due_at: c.due_at as string, sent_at: c.sent_at as string, answered_at: (c.answered_at as string) ?? null,
      doc_count: (db.prepare("SELECT COUNT(*) n FROM documents WHERE clarification_id = ?").get(c.id) as { n: number }).n,
    };
  });
}

export function facilityClarificationDetail(db: Database.Database, p: Principal, id: string) {
  assertCan(p, "facility.respond");
  const fid = facilityOf(p);
  const c = db.prepare("SELECT * FROM clarifications WHERE id = ?").get(id) as (Record<string, unknown> & { id: string; facility_id: string; finding_id: string | null }) | undefined;
  if (!c || c.status === "withdrawn") throw new DomainError("Klarifikasi tidak ditemukan.", 404);
  assertFacility(p, c.facility_id);
  if (c.facility_id !== fid) throw new AuthError("Akses lintas faskes ditolak.");
  const f = c.finding_id ? getFinding(db, c.finding_id) : undefined;
  const messages = db.prepare("SELECT author_role, text, document_id, at FROM clarification_messages WHERE clarification_id = ? ORDER BY id").all(c.id) as { author_role: string; text: string; document_id: string | null; at: string }[];
  const docs = db.prepare("SELECT id, name, mime, size, kind, processing_status, created_at FROM documents WHERE facility_id = ? AND (clarification_id = ? OR finding_id = ?) ORDER BY created_at").all(fid, c.id, c.finding_id) as { id: string; name: string; mime: string; size: number; kind: string; processing_status: string; created_at: string }[];
  return {
    clarification: { ...c, requested_docs: json<string[]>(c.requested_docs_json as string, []) } as unknown as FacilityClarification & { response_text: string | null; lapsed_at: string | null },
    finding: f ? toFacilityFinding(db, f) : null,
    // ringkas: apa yang diminta, apa yang sudah dijawab, dokumen terlampir
    messages: messages.filter((m) => !m.text.startsWith("Permintaan ditarik")),
    docs,
    canAnswer: c.status === "sent" || c.status === "lapsed",
    late: c.status === "lapsed" || (c.status === "sent" && String(c.due_at) < new Date().toISOString().slice(0, 16)),
  };
}

export function facilityFindingView(db: Database.Database, p: Principal, findingId: string) {
  assertCan(p, "facility.respond");
  const fid = facilityOf(p);
  const f = getFinding(db, findingId);
  if (!f || f.facility_id !== fid) throw new DomainError("Temuan tidak ditemukan.", 404);
  if (!findingVisibleToFacility(db, f.id, fid)) throw new DomainError("Temuan tidak ditemukan.", 404);
  const clar = db.prepare("SELECT id, status, issue, due_at, sent_at, answered_at FROM clarifications WHERE finding_id = ? AND status <> 'withdrawn' ORDER BY sent_at").all(f.id) as { id: string; status: string; issue: string; due_at: string; sent_at: string; answered_at: string | null }[];
  const disputes = db.prepare("SELECT id, text, status, response, created_at, resolved_at FROM disputes WHERE kind = 'finding' AND ref_id = ? ORDER BY created_at").all(f.id) as { id: string; text: string; status: string; response: string | null; created_at: string; resolved_at: string | null }[];
  const actions = db.prepare("SELECT id, description, owner, target_date, status, result, remeasure_plan FROM improvement_actions WHERE finding_id = ? ORDER BY created_at").all(f.id) as FacilityAction[];
  return { finding: toFacilityFinding(db, f), clarifications: clar, disputes, actions, canDispute: !disputes.some((d) => d.status === "open") };
}

export interface FacilityAction { id: string; description: string; owner: string | null; target_date: string | null; status: string; result: string | null; remeasure_plan: string | null }
export function facilityActions(db: Database.Database, p: Principal) {
  assertCan(p, "facility.respond");
  const fid = facilityOf(p);
  const rows = db.prepare("SELECT a.id, a.finding_id, a.description, a.owner, a.target_date, a.status, a.result, a.remeasure_plan FROM improvement_actions a WHERE a.facility_id = ? ORDER BY CASE a.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 WHEN 'follow_up_pending' THEN 3 ELSE 4 END, a.target_date").all(fid) as (FacilityAction & { finding_id: string | null })[];
  return rows.map((a) => ({
    ...a,
    finding_title: a.finding_id ? (() => { const f = getFinding(db, a.finding_id!); return f ? toFacilityFinding(db, f).title : "-"; })() : "-",
    // faskes melihat adanya tindak lanjut (mis. konfirmasi peserta), tetapi bukan identitas atau jawaban peserta
    followups: db.prepare("SELECT kind, status, due_at FROM follow_ups WHERE action_id = ? ORDER BY created_at").all(a.id) as { kind: string; status: string; due_at: string | null }[],
  }));
}

export function facilityDisputes(db: Database.Database, p: Principal) {
  assertCan(p, "facility.respond");
  const fid = facilityOf(p);
  const rows = db.prepare("SELECT id, ref_id, text, status, response, created_at, resolved_at FROM disputes WHERE facility_id = ? AND kind = 'finding' ORDER BY created_at DESC").all(fid) as { id: string; ref_id: string; text: string; status: string; response: string | null; created_at: string; resolved_at: string | null }[];
  const disputable = (db.prepare(`SELECT f.* FROM findings f WHERE f.facility_id = ? AND ${FACILITY_VISIBLE_SQL} ORDER BY f.updated_at DESC`).all(fid) as FindingRow[])
    .filter((f) => !rows.some((d) => d.ref_id === f.id && d.status === "open")).map((f) => toFacilityFinding(db, f));
  return { rows: rows.map((r) => ({ ...r, finding_title: (() => { const f = getFinding(db, r.ref_id); return f ? toFacilityFinding(db, f).title : "-"; })() })), disputable };
}

export function facilityDocuments(db: Database.Database, p: Principal) {
  assertCan(p, "evidence.upload");
  const fid = facilityOf(p);
  return db.prepare(
    `SELECT d.id, d.name, d.mime, d.size, d.kind, d.processing_status, d.created_at, d.clarification_id, d.finding_id FROM documents d WHERE d.facility_id = ? ORDER BY d.created_at DESC LIMIT 100`,
  ).all(fid) as { id: string; name: string; mime: string; size: number; kind: string; processing_status: string; created_at: string; clarification_id: string | null; finding_id: string | null }[];
}

/** Laporan mutu faskes sendiri: alur klarifikasi, tindakan, dan agregat survei per butir. Agregat disembunyikan bila responden < MIN_N_FACILITY. Tidak ada identitas atau jawaban individu. */
export function facilityQualityReport(db: Database.Database, p: Principal) {
  assertCan(p, "facility.report");
  const fid = facilityOf(p);
  const n = (sql: string, ...a: unknown[]) => (db.prepare(sql).get(fid, ...a) as { n: number }).n;
  const clar = {
    total: n("SELECT COUNT(*) n FROM clarifications WHERE facility_id = ? AND status <> 'withdrawn'"),
    answered: n("SELECT COUNT(*) n FROM clarifications WHERE facility_id = ? AND status = 'answered'"),
    answeredOnTime: n("SELECT COUNT(*) n FROM clarifications WHERE facility_id = ? AND status = 'answered' AND answered_at <= due_at"),
    lapsed: n("SELECT COUNT(*) n FROM clarifications WHERE facility_id = ? AND status = 'lapsed'"),
    waiting: n("SELECT COUNT(*) n FROM clarifications WHERE facility_id = ? AND status = 'sent'"),
  };
  const act = {
    total: n("SELECT COUNT(*) n FROM improvement_actions WHERE facility_id = ?"),
    closed: n("SELECT COUNT(*) n FROM improvement_actions WHERE facility_id = ? AND status = 'closed'"),
    inProgress: n("SELECT COUNT(*) n FROM improvement_actions WHERE facility_id = ? AND status IN ('open','in_progress','resolved','follow_up_pending')"),
  };
  const outcomes = db.prepare(`SELECT f.proof_status s, COUNT(*) n FROM findings f WHERE f.facility_id = ? AND ${FACILITY_VISIBLE_SQL} GROUP BY f.proof_status`).all(fid) as { s: string; n: number }[];
  const raw = db.prepare(
    `SELECT pf.indicator_id, pf.slot, pf.value, pf.session_id, COALESCE(iv.title, pf.indicator_id) title
     FROM participant_facts pf JOIN survey_sessions s ON s.id = pf.session_id LEFT JOIN indicator_versions iv ON iv.id = pf.indicator_id
     WHERE s.facility_id = ? AND s.is_sandbox = 0 AND pf.status = 'active' AND pf.indicator_id IS NOT NULL AND pf.indicator_id <> 'CTX_PROBES'`,
  ).all(fid) as { indicator_id: string; slot: string; value: string; session_id: string; title: string }[];
  const by = new Map<string, { title: string; sessions: Set<string>; counts: Map<string, number>; zero: number }>();
  for (const r of raw) {
    const e = by.get(r.indicator_id) ?? { title: r.title, sessions: new Set<string>(), counts: new Map<string, number>(), zero: 0 };
    e.sessions.add(r.session_id);
    if (isMetaValue(r.value)) e.zero++;
    else e.counts.set(r.value, (e.counts.get(r.value) ?? 0) + 1);
    by.set(r.indicator_id, e);
  }
  const indicators = [...by.entries()].map(([id, e]) => {
    const respondents = e.sessions.size;
    const shown = respondents >= MIN_N_FACILITY;
    const total = [...e.counts.values()].reduce((a, b) => a + b, 0);
    return {
      id, title: e.title, respondents, shown, zero: shown ? e.zero : null,
      distribution: shown ? [...e.counts.entries()].map(([value, count]) => ({ value, label: ANSWER_LABEL[value] ?? value.replaceAll("_", " "), count, share: total ? count / total : 0 })).sort((a, b) => b.count - a.count) : [],
    };
  }).sort((a, b) => b.respondents - a.respondents);
  return { clar, act, outcomes, indicators, minN: MIN_N_FACILITY };
}
