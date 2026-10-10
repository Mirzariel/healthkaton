import type Database from "better-sqlite3";
import { appendAudit } from "../audit";
import { AuthError, assertCan, assertFacility, isInternal, type Principal } from "../auth/principal";
import { nowIso, nowPrecise } from "../clock";
import { addDays } from "../dates";
import { json, nextId } from "../db";
import { PROOF_FINAL, PROOF_TRANSITIONS, ACTION_TRANSITIONS, CLARIFICATION_TRANSITIONS, LIFECYCLE_TRANSITIONS, assertMove, TransitionError } from "../domain/transitions";
import { DomainError } from "../idem";
import { findForbiddenTerms, type ActionStatus, type Cause, type CaseLifecycle, type FindingType, type ProofStatus } from "../labels";
import { SIGNAL_THRESHOLD, detectAll, tierOf, type Sig, type SignalDraft } from "./signals";

/* Inti mesin status kasus. Aturan yang ditegakkan di sini (dan sebagian lagi di basis data):
   I1  penyebab hanya terisi bila temuan 'verified' (CHECK pada findings)
   I5  eskalasi dugaan fraud: hak jawab faskes terpenuhi + dua persetujuan dari peran/orang berbeda; hasilnya "dugaan", bukan putusan
   I7  tidak ada keputusan bayar/koreksi/sanksi otomatis: keputusan klaim hanya dicatat sebagai SIMULASI oleh manusia
   Tenggat klarifikasi yang lewat TIDAK membuktikan apa pun. */

export const SYSTEM_ACTOR = { id: "sistem:engine", role: "sistem" } as const;
export type Actor = Pick<Principal, "id" | "role"> | typeof SYSTEM_ACTOR;
const A = (a: Actor) => ({ actor: a.id, actor_role: a.role });

export interface CaseRow {
  id: string; episode_id: string; facility_id: string; lifecycle: CaseLifecycle; priority: number; assignee_id: string | null; assignee_role: string | null;
  due_at: string | null; opened_at: string; first_review_at: string | null; closed_at: string | null; close_reason: string | null;
}
export interface FindingRow {
  id: string; case_id: string; dedupe_key: string | null; type: FindingType; source: string; claim_id: string | null; related_claim_id: string | null; episode_id: string;
  facility_id: string; service_id: string | null; indicator_id: string | null; title: string; summary: string; limit_text: string | null; signals_json: string;
  score: number; tier: number; signal_active: number; proof_status: ProofStatus; causes_json: string | null; causes_note: string | null; priority: number; created_at: string; updated_at: string;
}

export const getCase = (db: Database.Database, id: string) => db.prepare("SELECT * FROM cases WHERE id = ?").get(id) as CaseRow | undefined;
export const getFinding = (db: Database.Database, id: string) => db.prepare("SELECT * FROM findings WHERE id = ?").get(id) as FindingRow | undefined;
function mustCase(db: Database.Database, id: string) {
  const c = getCase(db, id);
  if (!c) throw new DomainError("Kasus tidak ditemukan.", 404);
  return c;
}
function mustFinding(db: Database.Database, id: string) {
  const f = getFinding(db, id);
  if (!f) throw new DomainError("Temuan tidak ditemukan.", 404);
  return f;
}

/** Akses ke kasus: staf internal semua; faskes hanya kasus faskesnya; peserta tidak punya akses ke ruang kasus. */
export function assertCaseAccess(p: Principal, facilityId: string) {
  if (isInternal(p)) return;
  if (p.role === "faskes") return assertFacility(p, facilityId);
  throw new AuthError("Peran ini tidak memiliki akses ke ruang kasus.");
}

/* ---------- Prioritas dan penugasan yang dapat dijelaskan ---------- */
export function computePriority(f: { type: FindingType; score: number; category?: string | null; claim_status?: string | null; help?: boolean }) {
  const basis: string[] = [];
  let pts = 0;
  if (f.score >= 70) { pts += 2; basis.push("sinyal kuat (skor ≥ 70)"); }
  else if (f.score >= 50) { pts += 1; basis.push("sinyal sedang (skor 50–69)"); }
  if (f.type === "T4") {
    pts += 1; basis.push("laporan layanan dari peserta (dampak langsung)");
    if (f.category && ["obat", "biaya", "kendala_belum_selesai"].includes(f.category)) { pts += 1; basis.push(`kategori ${f.category}`); }
  }
  if (f.help) { pts += 2; basis.push("peserta meminta bantuan"); }
  if (f.claim_status === "draft" || f.claim_status === "submitted") { pts += 1; basis.push("klaim belum dibayar (masih dapat diperbaiki sebelum bayar)"); }
  const priority = pts >= 3 ? 1 : pts >= 1 ? 2 : 3;
  return { priority, basis: basis.length ? basis.join("; ") : "tidak ada faktor pemberat" };
}

export function autoAssign(db: Database.Database, caseId: string, by: Actor = SYSTEM_ACTOR) {
  const c = mustCase(db, caseId);
  const staff = db.prepare("SELECT id, name FROM users WHERE role = 'verifikator' ORDER BY id").all() as { id: string; name: string }[];
  if (!staff.length) return null;
  const load = db.prepare("SELECT assignee_id, COUNT(*) n FROM cases WHERE lifecycle IN ('new','assigned','in_progress','reopened') AND assignee_id IS NOT NULL GROUP BY assignee_id").all() as { assignee_id: string; n: number }[];
  const loadOf = (id: string) => load.find((l) => l.assignee_id === `verifikator:${id}`)?.n ?? 0;
  const pick = [...staff].sort((a, b) => loadOf(a.id) - loadOf(b.id) || a.id.localeCompare(b.id))[0];
  const assignee = `verifikator:${pick.id}`;
  const reason = `Beban aktif terendah (${loadOf(pick.id)} kasus); kewenangan verifikator; prioritas ${c.priority}.`;
  assignCaseInternal(db, c, assignee, "verifikator", by, reason);
  return assignee;
}

function assignCaseInternal(db: Database.Database, c: CaseRow, assigneeId: string, assigneeRole: string, by: Actor, reason: string) {
  db.prepare("INSERT INTO assignments (case_id, assignee_id, assignee_role, assigned_by, reason, priority_basis, at) VALUES (?,?,?,?,?,?,?)").run(c.id, assigneeId, assigneeRole, by.id, reason, `prioritas ${c.priority}`, nowPrecise());
  const next: CaseLifecycle = c.lifecycle === "new" || c.lifecycle === "reopened" ? "assigned" : c.lifecycle;
  if (next !== c.lifecycle) assertMove("siklus kasus", LIFECYCLE_TRANSITIONS, c.lifecycle, next);
  db.prepare("UPDATE cases SET assignee_id = ?, assignee_role = ?, lifecycle = ? WHERE id = ?").run(assigneeId, assigneeRole, next, c.id);
  appendAudit(db, { ...A(by), action: "kasus_ditugaskan", entity: "case", entity_id: c.id, detail: { kepada: assigneeId, alasan: reason } });
}

/** Penugasan manual oleh pihak berwenang (case.assign). */
export function assignCase(db: Database.Database, p: Principal, caseId: string, assigneeId: string, reason: string) {
  assertCan(p, "case.assign");
  const c = mustCase(db, caseId);
  if (c.lifecycle === "closed") throw new DomainError("Kasus sudah ditutup; buka ulang dulu.", 409);
  const u = db.prepare("SELECT id, role FROM users WHERE id = ? AND role IN ('verifikator','reviewer')").get(assigneeId.replace(/^[a-z]+:/, "")) as { id: string; role: string } | undefined;
  if (!u) throw new DomainError("Penerima tugas tidak dikenal atau tidak berwenang.", 422);
  if (reason.trim().length < 5) throw new DomainError("Alasan penugasan wajib diisi.", 422);
  db.transaction(() => assignCaseInternal(db, c, `${u.role}:${u.id}`, u.role, p, reason.trim()))();
}

/* ---------- Pembuatan temuan dan kasus ---------- */
export interface FindingInput {
  type: FindingType;
  source: "claim_engine" | "survey_routine" | "survey_directed" | "participant_report" | "documentation" | "pending";
  episode_id: string;
  facility_id: string;
  claim_id?: string | null;
  related_claim_id?: string | null;
  service_id?: string | null;
  indicator_id?: string | null;
  title: string;
  summary: string;
  limit_text?: string | null;
  signals?: Sig[];
  score?: number;
  dedupe_key: string;
  category?: string | null;
  help?: boolean;
}

/** Idempoten menurut dedupe_key. Satu kasus per episode; beberapa temuan boleh berdampingan di kasus yang sama. */
export function createFinding(db: Database.Database, by: Actor, f: FindingInput): { findingId: string; caseId: string; created: boolean } {
  const bad = findForbiddenTerms(`${f.title} ${f.summary}`);
  if (bad.length) throw new DomainError(`Kata tidak netral pada teks temuan: ${bad.join(", ")}.`, 422);
  return db.transaction(() => {
    const existing = db.prepare("SELECT id, case_id FROM findings WHERE dedupe_key = ?").get(f.dedupe_key) as { id: string; case_id: string } | undefined;
    if (existing) return { findingId: existing.id, caseId: existing.case_id, created: false };
    const now = nowPrecise();
    const claimStatus = f.claim_id ? (db.prepare("SELECT status FROM claims WHERE id = ?").get(f.claim_id) as { status: string } | undefined)?.status : null;
    const score = f.score ?? 0;
    const pr = computePriority({ type: f.type, score, category: f.category, claim_status: claimStatus, help: f.help });
    let c = db.prepare("SELECT * FROM cases WHERE episode_id = ? AND lifecycle <> 'closed' ORDER BY opened_at DESC LIMIT 1").get(f.episode_id) as CaseRow | undefined;
    let isNewCase = false;
    if (!c) {
      const id = nextId(db, "KS");
      db.prepare("INSERT INTO cases (id, episode_id, facility_id, lifecycle, priority, due_at, opened_at) VALUES (?,?,?,?,?,?,?)").run(id, f.episode_id, f.facility_id, "new", pr.priority, addDays(nowIso(), 14), now);
      c = getCase(db, id)!;
      isNewCase = true;
      appendAudit(db, { ...A(by), action: "kasus_dibuka", entity: "case", entity_id: id, detail: { episode: f.episode_id, facility: f.facility_id } });
    } else if (c.lifecycle === "closed") {
      throw new DomainError("Kasus tertutup.", 409);
    } else if (pr.priority < c.priority) {
      db.prepare("UPDATE cases SET priority = ? WHERE id = ?").run(pr.priority, c.id);
    }
    const id = nextId(db, "F");
    db.prepare(
      "INSERT INTO findings (id, case_id, dedupe_key, type, source, claim_id, related_claim_id, episode_id, facility_id, service_id, indicator_id, title, summary, limit_text, signals_json, score, tier, signal_active, proof_status, priority, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,'signal',?,?,?)",
    ).run(id, c.id, f.dedupe_key, f.type, f.source, f.claim_id ?? null, f.related_claim_id ?? null, f.episode_id, f.facility_id, f.service_id ?? null, f.indicator_id ?? null, f.title, f.summary, f.limit_text ?? null, JSON.stringify(f.signals ?? []), score, tierOf(score), pr.priority, now, now);
    appendAudit(db, { ...A(by), action: "temuan_dibuat", entity: "finding", entity_id: id, detail: { kasus: c.id, jenis: f.type, sumber: f.source, skor: score, dasar_prioritas: pr.basis } });
    if (isNewCase) autoAssign(db, c.id, SYSTEM_ACTOR);
    return { findingId: id, caseId: c.id, created: true };
  })();
}

/** Hitung ulang sinyal terhadap data terkini. Sinyal yang gugur TIDAK mengubah status pembuktian: sistem hanya mengusulkan 'tidak terbukti' untuk disetujui reviewer. */
export function applySignalDraft(db: Database.Database, by: Actor, d: SignalDraft) {
  const res = createFinding(db, by, {
    type: d.type, source: d.type === "T1" ? "documentation" : "claim_engine", episode_id: d.episode_id, facility_id: d.facility_id, claim_id: d.claim_id, related_claim_id: d.related_claim_id, service_id: d.service_id,
    title: d.title, summary: d.summary, limit_text: d.limit_text, signals: d.signals, score: d.score, dedupe_key: d.dedupe_key,
  });
  if (!res.created) refreshSignal(db, by, res.findingId, d);
  return res;
}

export function refreshSignal(db: Database.Database, by: Actor, findingId: string, d: Pick<SignalDraft, "signals" | "score"> | null) {
  const f = mustFinding(db, findingId);
  const score = d?.score ?? 0;
  const active = score >= SIGNAL_THRESHOLD ? 1 : 0;
  if (f.score === score && f.signal_active === active && f.signals_json === JSON.stringify(d?.signals ?? [])) return;
  db.transaction(() => {
    db.prepare("UPDATE findings SET score = ?, tier = ?, signal_active = ?, signals_json = ?, updated_at = ? WHERE id = ?").run(score, tierOf(score), active, JSON.stringify(d?.signals ?? []), nowPrecise(), findingId);
    appendAudit(db, { ...A(by), action: "sinyal_dihitung_ulang", entity: "finding", entity_id: findingId, detail: { skor_lama: f.score, skor_baru: score, aktif: !!active } });
    if (!active && f.signal_active && !PROOF_FINAL.includes(f.proof_status)) {
      const pending = db.prepare("SELECT 1 FROM review_decisions WHERE finding_id = ? AND kind = 'proof_proposal' AND state = 'pending'").get(findingId);
      if (!pending) {
        db.prepare("INSERT INTO review_decisions (case_id, finding_id, kind, decision, reason, actor_id, actor_role, state, simulated, at) VALUES (?,?,?,?,?,?,?,'pending',0,?)").run(
          f.case_id, findingId, "proof_proposal", "not_verified", "Usulan sistem: sinyal gugur setelah bukti/data baru. Menunggu persetujuan reviewer; status tidak berubah otomatis.", SYSTEM_ACTOR.id, SYSTEM_ACTOR.role, nowPrecise(),
        );
        appendAudit(db, { ...A(by), action: "usulan_tidak_terbukti_oleh_sistem", entity: "finding", entity_id: findingId, detail: {} });
      }
    }
  })();
}

/** Sinkronkan seluruh sinyal klaim: buat temuan baru, perbarui yang lama. Idempoten. */
export function syncClaimSignals(db: Database.Database, by: Actor = SYSTEM_ACTOR) {
  const { drafts } = detectAll(db);
  const seen = new Set<string>();
  let created = 0;
  for (const d of drafts) {
    seen.add(d.dedupe_key);
    const r = applySignalDraft(db, by, d);
    if (r.created) created++;
  }
  // temuan lama yang tidak lagi terdeteksi (mis. bukti baru ditautkan): sinyal gugur → usulan, bukan keputusan
  const old = db.prepare("SELECT id, dedupe_key FROM findings WHERE type IN ('T1','T2','T3') AND signal_active = 1 AND dedupe_key IS NOT NULL").all() as { id: string; dedupe_key: string }[];
  for (const o of old) if (!seen.has(o.dedupe_key)) refreshSignal(db, by, o.id, null);
  return { created, total: drafts.length };
}

/* ---------- Mesin status pembuktian ---------- */
function setProof(db: Database.Database, f: FindingRow, to: ProofStatus, by: Actor, detail: Record<string, unknown> = {}) {
  assertMove("pembuktian", PROOF_TRANSITIONS, f.proof_status, to);
  if (f.proof_status === to) return;
  const clearCauses = to !== "verified";
  db.prepare(`UPDATE findings SET proof_status = ?, updated_at = ?${clearCauses ? ", causes_json = NULL, causes_note = NULL" : ""} WHERE id = ?`).run(to, nowPrecise(), f.id);
  appendAudit(db, { ...A(by), action: "status_pembuktian", entity: "finding", entity_id: f.id, detail: { dari: f.proof_status, ke: to, ...detail } });
}

function touchCaseWork(db: Database.Database, caseId: string, by: Actor) {
  const c = mustCase(db, caseId);
  if (c.lifecycle === "assigned" || c.lifecycle === "new" || c.lifecycle === "reopened") {
    db.prepare("UPDATE cases SET lifecycle = 'in_progress', first_review_at = COALESCE(first_review_at, ?) WHERE id = ?").run(nowPrecise(), caseId);
    appendAudit(db, { ...A(by), action: "kasus_berjalan", entity: "case", entity_id: caseId, detail: {} });
  }
}

export function startReview(db: Database.Database, p: Principal, findingId: string) {
  assertCan(p, "case.work");
  db.transaction(() => {
    const f = mustFinding(db, findingId);
    if (f.proof_status !== "signal") throw new DomainError("Peninjauan hanya dapat dimulai dari status 'Sinyal'.", 409);
    setProof(db, f, "under_review", p);
    touchCaseWork(db, f.case_id, p);
  })();
}

export function evidenceCounts(db: Database.Database, findingId: string) {
  const r = db.prepare("SELECT direction, COUNT(*) n FROM evidence_links WHERE finding_id = ? GROUP BY direction").all(findingId) as { direction: string; n: number }[];
  const n = (d: string) => r.find((x) => x.direction === d)?.n ?? 0;
  return { supports: n("supports"), contradicts: n("contradicts"), neutral: n("neutral") };
}

/** Hak jawab faskes terpenuhi bila ada klarifikasi untuk temuan ini yang sudah dijawab atau tenggatnya lewat (lapsed). Lewat tenggat memenuhi hak jawab, tetapi tidak membuktikan apa pun. */
export function rightOfReplySatisfied(db: Database.Database, findingId: string) {
  const rows = db.prepare("SELECT status FROM clarifications WHERE finding_id = ? AND status <> 'withdrawn'").all(findingId) as { status: string }[];
  if (!rows.length) return { satisfied: false, reason: "Belum ada klarifikasi yang dikirim ke faskes." };
  if (rows.some((r) => r.status === "sent")) return { satisfied: false, reason: "Masih ada klarifikasi yang menunggu jawaban faskes." };
  return { satisfied: true, reason: "Faskes sudah menjawab atau tenggat klarifikasi telah lewat." };
}

export type ProofOutcome = "verified" | "not_verified" | "inconclusive";
/** Verifikator MENGUSULKAN hasil pembuktian; reviewer menyetujui (orang berbeda). */
export function proposeProof(db: Database.Database, p: Principal, findingId: string, outcome: ProofOutcome, reason: string) {
  assertCan(p, "case.work");
  const why = reason.trim();
  if (why.length < 15) throw new DomainError("Alasan usulan wajib diisi (minimal 15 karakter) dan menyebut dasar buktinya.", 422);
  return db.transaction(() => {
    const f = mustFinding(db, findingId);
    assertCaseAccess(p, f.facility_id);
    if (PROOF_FINAL.includes(f.proof_status)) throw new DomainError("Temuan sudah berstatus akhir. Buka ulang dulu bila ada bukti baru.", 409);
    if (f.proof_status === "awaiting_clarification") throw new DomainError("Temuan masih menunggu klarifikasi faskes.", 409);
    if (outcome === "verified") {
      if (f.proof_status !== "under_review") throw new DomainError("Pembuktian dimulai dari 'Sedang ditinjau' (mulai tinjauan dulu).", 409);
      const ev = evidenceCounts(db, findingId);
      if (ev.supports < 1) throw new DomainError("'Terbukti' membutuhkan sedikitnya satu bukti yang tertaut dan mendukung temuan.", 422);
      const rr = rightOfReplySatisfied(db, findingId);
      if (!rr.satisfied) throw new DomainError(`Hak jawab faskes belum terpenuhi. ${rr.reason}`, 422);
    }
    if (outcome === "inconclusive") {
      // catatan pencarian dapat terkait klaim (jalur lama) atau langsung ke temuan (migrasi 004; berlaku juga untuk temuan tanpa klaim)
      const n = (db.prepare("SELECT COUNT(*) n FROM evidence_searches WHERE (finding_id = ? OR (claim_id IS NOT NULL AND claim_id = ?)) AND result IN ('not_found','inconsistent')").get(f.id, f.claim_id) as { n: number }).n;
      if (n < 1) throw new DomainError("'Tidak dapat dibuktikan' membutuhkan catatan pencarian bukti yang sudah dilakukan.", 422);
    }
    db.prepare("UPDATE review_decisions SET state = 'rejected' WHERE finding_id = ? AND kind = 'proof_proposal' AND state = 'pending'").run(findingId);
    const info = db.prepare("INSERT INTO review_decisions (case_id, finding_id, kind, decision, reason, actor_id, actor_role, state, simulated, at) VALUES (?,?,?,?,?,?,?,'pending',0,?)").run(f.case_id, findingId, "proof_proposal", outcome, why, p.id, p.role, nowPrecise());
    appendAudit(db, { ...A(p), action: "usulan_pembuktian", entity: "finding", entity_id: findingId, detail: { hasil: outcome, usulan: Number(info.lastInsertRowid) } });
    return Number(info.lastInsertRowid);
  })();
}

/** Reviewer menyetujui atau menolak usulan. Pengusul tidak boleh menyetujui usulannya sendiri. */
export function decideProof(db: Database.Database, p: Principal, proposalId: number, approve: boolean, note: string) {
  assertCan(p, "case.review");
  return db.transaction(() => {
    const d = db.prepare("SELECT * FROM review_decisions WHERE id = ? AND kind = 'proof_proposal'").get(proposalId) as { id: number; finding_id: string; decision: ProofOutcome; actor_id: string; state: string } | undefined;
    if (!d) throw new DomainError("Usulan tidak ditemukan.", 404);
    if (d.state !== "pending") throw new DomainError("Usulan sudah diputuskan.", 409);
    if (d.actor_id === p.id) throw new DomainError("Pengusul tidak dapat menyetujui usulannya sendiri.", 403);
    const f = mustFinding(db, d.finding_id);
    assertCaseAccess(p, f.facility_id);
    if (!approve) {
      if (note.trim().length < 5) throw new DomainError("Alasan penolakan wajib diisi.", 422);
      db.prepare("UPDATE review_decisions SET state = 'rejected' WHERE id = ?").run(d.id);
      db.prepare("INSERT INTO review_decisions (case_id, finding_id, kind, decision, reason, actor_id, actor_role, state, ref_id, simulated, at) VALUES (?,?,?,?,?,?,?,'recorded',?,0,?)").run(f.case_id, f.id, "proof_approval", "rejected", note.trim(), p.id, p.role, d.id, nowPrecise());
      appendAudit(db, { ...A(p), action: "usulan_pembuktian_ditolak", entity: "finding", entity_id: f.id, detail: { usulan: d.id } });
      return f.proof_status;
    }
    if (f.proof_status === "signal" && d.decision === "verified") throw new DomainError("Tidak dapat menyetujui 'Terbukti' dari status 'Sinyal'.", 409);
    if (d.decision === "verified") {
      // hak jawab mencakup bantahan: 'Terbukti' tidak disetujui selagi ada bantahan faskes yang belum ditanggapi
      const open = db.prepare("SELECT 1 FROM disputes WHERE kind = 'finding' AND ref_id = ? AND status = 'open'").get(f.id);
      if (open) throw new DomainError("Ada bantahan faskes atas temuan ini yang belum ditanggapi. Tanggapi dulu sebelum menyetujui 'Terbukti'.", 409);
    }
    setProof(db, f, d.decision, p, { usulan: d.id });
    db.prepare("UPDATE review_decisions SET state = 'approved' WHERE id = ?").run(d.id);
    db.prepare("INSERT INTO review_decisions (case_id, finding_id, kind, decision, reason, actor_id, actor_role, state, ref_id, simulated, at) VALUES (?,?,?,?,?,?,?,'recorded',?,0,?)").run(f.case_id, f.id, "proof_approval", d.decision, note.trim() || "Disetujui.", p.id, p.role, d.id, nowPrecise());
    touchCaseWork(db, f.case_id, p);
    return d.decision;
  })();
}

/** Analisis penyebab final hanya untuk temuan 'verified'. Kategori administratif dan pelayanan dapat berdampingan. 'Dugaan fraud' hanya lewat jalur eskalasi. */
export function setCauses(db: Database.Database, p: Principal, findingId: string, causes: Exclude<Cause, "suspected_fraud">[], note: string) {
  assertCan(p, "case.cause");
  const ok = new Set<string>(["administrative", "service_process"]);
  if (!causes.length || causes.some((c) => !ok.has(c))) throw new DomainError("Penyebab harus berupa 'administratif' dan/atau 'proses pelayanan'. Dugaan fraud memakai jalur eskalasi.", 422);
  if (note.trim().length < 10) throw new DomainError("Catatan analisis penyebab wajib diisi (minimal 10 karakter).", 422);
  db.transaction(() => {
    const f = mustFinding(db, findingId);
    assertCaseAccess(p, f.facility_id);
    if (f.proof_status !== "verified") throw new DomainError("Analisis penyebab final baru terbuka setelah temuan berstatus 'Terbukti'.", 409);
    const keepFraud = json<string[]>(f.causes_json, []).includes("suspected_fraud") ? ["suspected_fraud"] : [];
    const merged = [...new Set([...causes, ...keepFraud])];
    db.prepare("UPDATE findings SET causes_json = ?, causes_note = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(merged), note.trim(), nowPrecise(), findingId);
    db.prepare("INSERT INTO review_decisions (case_id, finding_id, kind, decision, reason, actor_id, actor_role, state, simulated, at) VALUES (?,?,?,?,?,?,?,'recorded',0,?)").run(f.case_id, findingId, "cause", merged.join(","), note.trim(), p.id, p.role, nowPrecise());
    appendAudit(db, { ...A(p), action: "penyebab_ditetapkan", entity: "finding", entity_id: findingId, detail: { penyebab: merged } });
  })();
}

/** Langkah 1 eskalasi dugaan fraud (reviewer). Syarat: terbukti, hak jawab terpenuhi. Belum berdampak apa pun sebelum disetujui pihak kedua. */
export function requestFraudEscalation(db: Database.Database, p: Principal, findingId: string, reason: string) {
  assertCan(p, "fraud.escalate");
  if (p.role !== "reviewer") throw new AuthError("Permintaan eskalasi diajukan reviewer; persetujuan kedua oleh auditor.");
  if (reason.trim().length < 20) throw new DomainError("Dasar eskalasi wajib diuraikan (minimal 20 karakter).", 422);
  return db.transaction(() => {
    const f = mustFinding(db, findingId);
    if (f.proof_status !== "verified") throw new DomainError("Eskalasi hanya untuk temuan 'Terbukti'.", 409);
    const rr = rightOfReplySatisfied(db, findingId);
    if (!rr.satisfied) throw new DomainError(`Hak jawab faskes belum terpenuhi. ${rr.reason}`, 422);
    if (!json<string[]>(f.causes_json, []).length) throw new DomainError("Tetapkan analisis penyebab (administratif/proses) lebih dulu agar penjelasan alternatif sudah ditimbang.", 422);
    const open = db.prepare("SELECT 1 FROM review_decisions WHERE finding_id = ? AND kind = 'escalation' AND state = 'pending'").get(findingId);
    if (open) throw new DomainError("Sudah ada permintaan eskalasi yang menunggu persetujuan.", 409);
    const info = db.prepare("INSERT INTO review_decisions (case_id, finding_id, kind, decision, reason, actor_id, actor_role, state, simulated, at) VALUES (?,?,?,?,?,?,?,'pending',0,?)").run(f.case_id, findingId, "escalation", "suspected_fraud", reason.trim(), p.id, p.role, nowPrecise());
    appendAudit(db, { ...A(p), action: "eskalasi_diminta", entity: "finding", entity_id: findingId, detail: { permintaan: Number(info.lastInsertRowid) } });
    return Number(info.lastInsertRowid);
  })();
}

/** Langkah 2 (auditor, orang dan peran berbeda). Hasilnya HANYA label "dugaan"; bukan pembuktian fraud, bukan sanksi. */
export function approveFraudEscalation(db: Database.Database, p: Principal, requestId: number, approve: boolean, note: string) {
  assertCan(p, "fraud.escalate");
  if (p.role !== "auditor") throw new AuthError("Persetujuan kedua eskalasi dilakukan auditor.");
  return db.transaction(() => {
    const d = db.prepare("SELECT * FROM review_decisions WHERE id = ? AND kind = 'escalation'").get(requestId) as { id: number; finding_id: string; actor_id: string; actor_role: string; state: string } | undefined;
    if (!d) throw new DomainError("Permintaan eskalasi tidak ditemukan.", 404);
    if (d.state !== "pending") throw new DomainError("Permintaan sudah diputuskan.", 409);
    if (d.actor_id === p.id || d.actor_role === p.role) throw new AuthError("Persetujuan kedua harus dari orang dan peran yang berbeda dari pengaju.");
    if (note.trim().length < 10) throw new DomainError("Catatan persetujuan/penolakan wajib diisi.", 422);
    const f = mustFinding(db, d.finding_id);
    const rr = rightOfReplySatisfied(db, f.id);
    if (approve && !rr.satisfied) throw new DomainError(`Hak jawab faskes belum terpenuhi. ${rr.reason}`, 422);
    if (approve && f.proof_status !== "verified") throw new DomainError("Temuan sudah tidak berstatus 'Terbukti'.", 409);
    db.prepare("UPDATE review_decisions SET state = ? WHERE id = ?").run(approve ? "approved" : "rejected", d.id);
    db.prepare("INSERT INTO review_decisions (case_id, finding_id, kind, decision, reason, actor_id, actor_role, state, ref_id, simulated, at) VALUES (?,?,?,?,?,?,?,'recorded',?,0,?)").run(f.case_id, f.id, "fraud_approval", approve ? "approved" : "rejected", note.trim(), p.id, p.role, d.id, nowPrecise());
    if (approve) {
      const causes = [...new Set([...json<string[]>(f.causes_json, []), "suspected_fraud"])];
      db.prepare("UPDATE findings SET causes_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(causes), nowPrecise(), f.id);
    }
    appendAudit(db, { ...A(p), action: approve ? "eskalasi_disetujui" : "eskalasi_ditolak", entity: "finding", entity_id: f.id, detail: { permintaan: d.id, catatan: "label dugaan, bukan putusan" } });
  })();
}

/** Buka ulang temuan berstatus akhir bila ada bukti baru. Penyebab dikosongkan (riwayat tetap di keputusan & audit). */
export function reopenFinding(db: Database.Database, p: Principal, findingId: string, reason: string) {
  assertCan(p, "case.review");
  if (reason.trim().length < 10) throw new DomainError("Alasan membuka ulang wajib diisi.", 422);
  db.transaction(() => {
    const f = mustFinding(db, findingId);
    assertCaseAccess(p, f.facility_id);
    if (!PROOF_FINAL.includes(f.proof_status)) throw new DomainError("Hanya temuan berstatus akhir yang dapat dibuka ulang.", 409);
    setProof(db, f, "under_review", p, { alasan_dibuka_ulang: true });
    db.prepare("INSERT INTO review_decisions (case_id, finding_id, kind, decision, reason, actor_id, actor_role, state, simulated, at) VALUES (?,?,?,?,?,?,?,'recorded',0,?)").run(f.case_id, findingId, "reopen", f.proof_status, reason.trim(), p.id, p.role, nowPrecise());
    const c = mustCase(db, f.case_id);
    if (c.lifecycle === "closed") {
      db.prepare("UPDATE cases SET lifecycle = 'reopened', closed_at = NULL, close_reason = NULL WHERE id = ?").run(c.id);
      appendAudit(db, { ...A(p), action: "kasus_dibuka_ulang", entity: "case", entity_id: c.id, detail: {} });
    }
  })();
}

export const CLAIM_REVIEW_OPTIONS = ["loloskan", "koreksi_nilai", "tolak", "eskalasi_audit"] as const;
export type ClaimReviewOption = (typeof CLAIM_REVIEW_OPTIONS)[number];
/** Keputusan klaim oleh manusia. Dicatat sebagai SIMULASI: tidak ada eksekusi bayar/sanksi ke sistem resmi mana pun. Dipisahkan dari status temuan pelayanan. */
export function recordClaimReview(db: Database.Database, p: Principal, findingId: string, option: ClaimReviewOption, reason: string, correction?: number | null) {
  assertCan(p, "claimreview.record");
  if (!(CLAIM_REVIEW_OPTIONS as readonly string[]).includes(option)) throw new DomainError("Pilihan keputusan klaim tidak dikenal.", 422);
  if (reason.trim().length < 10) throw new DomainError("Alasan keputusan wajib diisi (minimal 10 karakter).", 422);
  return db.transaction(() => {
    const f = mustFinding(db, findingId);
    assertCaseAccess(p, f.facility_id);
    if (!f.claim_id) throw new DomainError("Temuan ini tidak terkait klaim; tidak ada keputusan klaim yang dapat dicatat.", 409);
    if (!PROOF_FINAL.includes(f.proof_status)) throw new DomainError("Keputusan klaim dicatat setelah pembuktian temuan selesai.", 409);
    if (option === "koreksi_nilai" && !(Number(correction) >= 0)) throw new DomainError("Nilai koreksi wajib diisi.", 422);
    const info = db.prepare("INSERT INTO review_decisions (case_id, finding_id, kind, decision, reason, correction_amount, actor_id, actor_role, state, simulated, at) VALUES (?,?,?,?,?,?,?,?,'recorded',1,?)").run(
      f.case_id, findingId, "claim_review", option, reason.trim(), option === "koreksi_nilai" ? Math.round(Number(correction)) : null, p.id, p.role, nowPrecise(),
    );
    appendAudit(db, { ...A(p), action: "keputusan_klaim_dicatat_simulasi", entity: "finding", entity_id: findingId, detail: { opsi: option, simulasi: true } });
    return Number(info.lastInsertRowid);
  })();
}

/* ---------- Klarifikasi (hak jawab faskes) ---------- */
export function sendClarification(db: Database.Database, p: Principal, input: { findingId: string; issue: string; requestedDocs?: string[]; minimalRef?: string; dueAt: string }) {
  assertCan(p, "case.work");
  const issue = input.issue.trim();
  if (issue.length < 15) throw new DomainError("Uraikan hal yang diklarifikasi (minimal 15 karakter).", 422);
  const bad = findForbiddenTerms(issue);
  if (bad.length) throw new DomainError(`Gunakan bahasa netral. Kata tidak diizinkan: ${bad.join(", ")}.`, 422);
  if (input.dueAt <= nowIso()) throw new DomainError("Tenggat harus di masa depan.", 422);
  return db.transaction(() => {
    const f = mustFinding(db, input.findingId);
    assertCaseAccess(p, f.facility_id);
    if (PROOF_FINAL.includes(f.proof_status)) throw new DomainError("Temuan sudah berstatus akhir.", 409);
    const id = nextId(db, "KL");
    db.prepare("INSERT INTO clarifications (id, case_id, finding_id, facility_id, issue, requested_docs_json, minimal_ref, due_at, status, sent_by, sent_at) VALUES (?,?,?,?,?,?,?,?,'sent',?,?)").run(
      id, f.case_id, f.id, f.facility_id, issue, JSON.stringify(input.requestedDocs ?? []), input.minimalRef ?? null, input.dueAt, p.id, nowPrecise(),
    );
    if (f.proof_status === "signal") setProof(db, f, "under_review", p);
    const f2 = mustFinding(db, f.id);
    if (f2.proof_status === "under_review") setProof(db, f2, "awaiting_clarification", p, { klarifikasi: id });
    touchCaseWork(db, f.case_id, p);
    appendAudit(db, { ...A(p), action: "klarifikasi_dikirim", entity: "clarification", entity_id: id, detail: { temuan: f.id, tenggat: input.dueAt } });
    return id;
  })();
}

export function respondClarification(db: Database.Database, p: Principal, clarificationId: string, text: string, documentId?: string | null) {
  assertCan(p, "facility.respond");
  const t = text.trim();
  if (t.length < 5) throw new DomainError("Jawaban tidak boleh kosong.", 422);
  if (t.length > 4000) throw new DomainError("Jawaban terlalu panjang (maks. 4000 karakter).", 422);
  db.transaction(() => {
    const c = db.prepare("SELECT * FROM clarifications WHERE id = ?").get(clarificationId) as { id: string; finding_id: string; facility_id: string; status: "sent" | "lapsed" | "answered" | "withdrawn"; due_at: string } | undefined;
    if (!c) throw new DomainError("Klarifikasi tidak ditemukan.", 404);
    assertFacility(p, c.facility_id);
    assertMove("klarifikasi", CLARIFICATION_TRANSITIONS, c.status, "answered");
    if (c.status === "answered") throw new DomainError("Klarifikasi sudah dijawab.", 409);
    const late = c.status === "lapsed" || nowIso() > c.due_at;
    db.prepare("UPDATE clarifications SET status = 'answered', answered_at = ?, response_text = ? WHERE id = ?").run(nowPrecise(), t, c.id);
    db.prepare("INSERT INTO clarification_messages (clarification_id, author_role, author_id, text, document_id, at) VALUES (?,?,?,?,?,?)").run(c.id, p.role, p.id, t, documentId ?? null, nowPrecise());
    const f = mustFinding(db, c.finding_id);
    if (f.proof_status === "awaiting_clarification") setProof(db, f, "under_review", p, { klarifikasi_dijawab: c.id });
    appendAudit(db, { ...A(p), action: "klarifikasi_dijawab", entity: "clarification", entity_id: c.id, detail: { terlambat: late } });
  })();
}

/** Tandai klarifikasi yang lewat tenggat. Memenuhi hak jawab, TIDAK memverifikasi apa pun, dan mengembalikan temuan ke 'Sedang ditinjau'. */
export function lapseOverdueClarifications(db: Database.Database, by: Actor = SYSTEM_ACTOR, now: string = nowIso()) {
  const due = db.prepare("SELECT id, finding_id FROM clarifications WHERE status = 'sent' AND due_at < ?").all(now) as { id: string; finding_id: string }[];
  for (const c of due) {
    db.transaction(() => {
      db.prepare("UPDATE clarifications SET status = 'lapsed', lapsed_at = ? WHERE id = ?").run(nowPrecise(), c.id);
      const f = mustFinding(db, c.finding_id);
      if (f.proof_status === "awaiting_clarification") setProof(db, f, "under_review", by, { klarifikasi_lewat_tenggat: c.id });
      appendAudit(db, { ...A(by), action: "klarifikasi_lewat_tenggat", entity: "clarification", entity_id: c.id, detail: { catatan: "keterlambatan dicatat; tidak membuktikan layanan tidak dilakukan" } });
    })();
  }
  return due.length;
}

/* ---------- Tindakan perbaikan dan tindak lanjut ---------- */
export function createAction(db: Database.Database, p: Principal, input: { findingId: string; description: string; owner: string; targetDate: string; remeasurePlan?: string; indicatorId?: string | null }) {
  if (p.role === "faskes") assertCan(p, "action.manage");
  else assertCan(p, "case.work");
  if (input.description.trim().length < 15) throw new DomainError("Uraikan tindakan perbaikan (minimal 15 karakter).", 422);
  if (!input.owner.trim()) throw new DomainError("Pemilik tindakan wajib diisi.", 422);
  if (input.targetDate <= nowIso().slice(0, 10)) throw new DomainError("Target harus di masa depan.", 422);
  return db.transaction(() => {
    const f = mustFinding(db, input.findingId);
    assertCaseAccess(p, f.facility_id);
    const id = nextId(db, "TP");
    db.prepare("INSERT INTO improvement_actions (id, finding_id, case_id, facility_id, indicator_id, owner, description, target_date, status, remeasure_plan, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,'open',?,?,?)").run(
      id, f.id, f.case_id, f.facility_id, input.indicatorId ?? f.indicator_id, input.owner.trim(), input.description.trim(), input.targetDate, input.remeasurePlan ?? null, p.id, nowPrecise(),
    );
    appendAudit(db, { ...A(p), action: "tindakan_dibuat", entity: "action", entity_id: id, detail: { temuan: f.id } });
    return id;
  })();
}

function mustAction(db: Database.Database, id: string) {
  const a = db.prepare("SELECT * FROM improvement_actions WHERE id = ?").get(id) as { id: string; finding_id: string; case_id: string; facility_id: string; status: ActionStatus; description: string } | undefined;
  if (!a) throw new DomainError("Tindakan tidak ditemukan.", 404);
  return a;
}
function moveAction(db: Database.Database, p: Principal, a: ReturnType<typeof mustAction>, to: ActionStatus, extra: string, params: unknown[], audit: string) {
  assertMove("tindakan", ACTION_TRANSITIONS, a.status, to);
  db.prepare(`UPDATE improvement_actions SET status = ?${extra} WHERE id = ?`).run(to, ...params, a.id);
  appendAudit(db, { ...A(p), action: audit, entity: "action", entity_id: a.id, detail: { dari: a.status, ke: to } });
}

export function startAction(db: Database.Database, p: Principal, actionId: string) {
  if (p.role === "faskes") assertCan(p, "action.manage");
  else assertCan(p, "case.work");
  db.transaction(() => {
    const a = mustAction(db, actionId);
    assertCaseAccess(p, a.facility_id);
    moveAction(db, p, a, "in_progress", ", started_at = ?", [nowPrecise()], "tindakan_dimulai");
  })();
}

export function resolveAction(db: Database.Database, p: Principal, actionId: string, result: string) {
  if (p.role === "faskes") assertCan(p, "action.manage");
  else assertCan(p, "case.work");
  if (result.trim().length < 10) throw new DomainError("Hasil tindakan wajib dijelaskan (minimal 10 karakter).", 422);
  db.transaction(() => {
    const a = mustAction(db, actionId);
    assertCaseAccess(p, a.facility_id);
    moveAction(db, p, a, "resolved", ", result = ?, resolved_at = ?", [result.trim(), nowPrecise()], "tindakan_selesai_dikerjakan");
  })();
}

/** Setelah selesai dikerjakan: minta konfirmasi peserta dan pengukuran ulang. Tindakan tidak ditutup oleh faskes sendiri. */
export function requestFollowUp(db: Database.Database, p: Principal, actionId: string, participantId: string | null, dueAt: string) {
  assertCan(p, "case.work");
  return db.transaction(() => {
    const a = mustAction(db, actionId);
    assertCaseAccess(p, a.facility_id);
    moveAction(db, p, a, "follow_up_pending", "", [], "tindak_lanjut_diminta");
    const ids: string[] = [];
    if (participantId) {
      const id = nextId(db, "FU");
      db.prepare("INSERT INTO follow_ups (id, action_id, kind, due_at, participant_id, status, created_at) VALUES (?,?,'participant_confirmation',?,?, 'pending', ?)").run(id, a.id, dueAt, participantId, nowPrecise());
      ids.push(id);
    }
    const rid = nextId(db, "FU");
    db.prepare("INSERT INTO follow_ups (id, action_id, kind, due_at, participant_id, status, created_at) VALUES (?,?,'remeasure',?,NULL,'pending',?)").run(rid, a.id, dueAt, nowPrecise());
    ids.push(rid);
    return ids;
  })();
}

/** Selesaikan satu tindak lanjut. Konfirmasi peserta 'resolved' menutup tindakan bila tak ada tindak lanjut lain; 'still_issue' membuka kembali pengerjaan. */
export function completeFollowUp(db: Database.Database, p: Principal, followUpId: string, outcome: "resolved" | "still_issue", note: string) {
  db.transaction(() => {
    const fu = db.prepare("SELECT * FROM follow_ups WHERE id = ?").get(followUpId) as { id: string; action_id: string; kind: string; participant_id: string | null; status: string } | undefined;
    if (!fu) throw new DomainError("Tindak lanjut tidak ditemukan.", 404);
    if (fu.status !== "pending") throw new DomainError("Tindak lanjut sudah diselesaikan.", 409);
    if (fu.kind === "participant_confirmation") {
      assertCan(p, "followup.confirm");
      if (p.participantId !== fu.participant_id) throw new AuthError("Konfirmasi hanya oleh peserta yang bersangkutan.");
    } else {
      assertCan(p, "case.work");
    }
    const a = mustAction(db, fu.action_id);
    db.prepare("UPDATE follow_ups SET status = 'done', outcome = ?, note = ?, done_at = ? WHERE id = ?").run(outcome, note.trim().slice(0, 1000) || null, nowPrecise(), fu.id);
    appendAudit(db, { ...A(p), action: "tindak_lanjut_selesai", entity: "follow_up", entity_id: fu.id, detail: { jenis: fu.kind, hasil: outcome } });
    if (outcome === "still_issue") {
      db.prepare("UPDATE follow_ups SET status = 'skipped' WHERE action_id = ? AND status = 'pending'").run(a.id);
      moveAction(db, p, a, "in_progress", ", resolved_at = NULL", [], "tindakan_dibuka_kembali");
      return;
    }
    const pending = (db.prepare("SELECT COUNT(*) n FROM follow_ups WHERE action_id = ? AND status = 'pending'").get(a.id) as { n: number }).n;
    if (pending === 0 && a.status === "follow_up_pending") moveAction(db, p, a, "closed", ", closed_at = ?", [nowPrecise()], "tindakan_ditutup");
  })();
}

/* ---------- Penutupan kasus ---------- */
export function closeCase(db: Database.Database, p: Principal, caseId: string, reason: string) {
  assertCan(p, "case.review");
  if (reason.trim().length < 10) throw new DomainError("Alasan penutupan wajib diisi.", 422);
  db.transaction(() => {
    const c = mustCase(db, caseId);
    assertCaseAccess(p, c.facility_id);
    assertMove("siklus kasus", LIFECYCLE_TRANSITIONS, c.lifecycle, "closed");
    const open = db.prepare("SELECT COUNT(*) n FROM findings WHERE case_id = ? AND proof_status NOT IN ('verified','not_verified','inconclusive')").get(caseId) as { n: number };
    if (open.n) throw new DomainError(`Masih ada ${open.n} temuan yang belum berstatus akhir.`, 409);
    const act = db.prepare("SELECT COUNT(*) n FROM improvement_actions WHERE case_id = ? AND status <> 'closed'").get(caseId) as { n: number };
    if (act.n) throw new DomainError(`Masih ada ${act.n} tindakan perbaikan yang belum ditutup.`, 409);
    db.prepare("UPDATE cases SET lifecycle = 'closed', closed_at = ?, close_reason = ? WHERE id = ?").run(nowPrecise(), reason.trim(), caseId);
    db.prepare("INSERT INTO review_decisions (case_id, finding_id, kind, decision, reason, actor_id, actor_role, state, simulated, at) VALUES (?,NULL,'close','closed',?,?,?,'recorded',0,?)").run(caseId, reason.trim(), p.id, p.role, nowPrecise());
    appendAudit(db, { ...A(p), action: "kasus_ditutup", entity: "case", entity_id: caseId, detail: {} });
  })();
}

export { TransitionError };
