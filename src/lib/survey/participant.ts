import type Database from "better-sqlite3";
import { appendAudit } from "../audit";
import { AuthError, assertCan, assertParticipant, respondentRole, type Principal } from "../auth/principal";
import { SYSTEM_ACTOR, completeFollowUp, createFinding, type Actor } from "../cases/core";
import { nowIso, nowPrecise } from "../clock";
import { addDays } from "../dates";
import { json, nextId } from "../db";
import { getAdapters } from "../adapters";
import { DomainError, idempotent } from "../idem";
import { SESSION_LABEL, STAGE_LABEL, findForbiddenTerms, type Stage } from "../labels";
import { serviceLay, whenLabel, type DirectedSubject } from "./phrases";
import { describeFacts } from "./service";

/* Sisi peserta di luar wawancara: beranda, undangan (termasuk konfirmasi terarah), laporan kendala, permintaan bantuan, konfirmasi tindak lanjut, riwayat.
   Peserta tidak pernah melihat sinyal, skor, atau temuan mesin klaim (aturan 'tidak menuduh'): hanya status laporan dan tindak lanjut miliknya. */

export const REPORT_CATEGORIES = [
  { id: "obat", label: "Obat" },
  { id: "biaya", label: "Biaya" },
  { id: "dokter", label: "Pemeriksaan atau dokter" },
  { id: "informasi", label: "Penjelasan atau informasi" },
  { id: "administrasi", label: "Administrasi atau berkas" },
  { id: "lainnya", label: "Lainnya" },
] as const;
export const REPORT_STATUS_LABEL: Record<string, { label: string; hint: string }> = {
  received: { label: "Diterima", hint: "Laporan Anda sudah masuk dan menunggu dilihat petugas." },
  in_review: { label: "Sedang ditinjau", hint: "Petugas sedang memeriksa laporan Anda." },
  clarification: { label: "Faskes diminta menjelaskan", hint: "Faskes diberi kesempatan memberi penjelasan. Ini belum berarti ada kesalahan." },
  action: { label: "Perbaikan sedang dikerjakan", hint: "Ada perbaikan yang sedang dikerjakan faskes." },
  resolved: { label: "Selesai ditangani", hint: "Penanganan selesai. Anda mungkin diminta mengonfirmasi." },
  closed: { label: "Selesai ditinjau", hint: "Petugas telah selesai meninjau laporan ini." },
};

const actorLike = (a: Actor | Principal) => ({ actor: a.id, actor_role: a.role });
const isPrincipal = (a: Actor | Principal): a is Principal => "facilityId" in a;

/* ---------- Undangan ---------- */
export interface InvitationInput {
  episode_id: string;
  stage: Stage;
  mode?: "routine" | "directed";
  subject?: DirectedSubject | null;
  scheduled_for?: string | null;
  expires_in_days?: number;
  status?: "scheduled" | "sent";
}
export function createInvitation(db: Database.Database, by: Actor | Principal, inp: InvitationInput) {
  if (isPrincipal(by)) assertCan(by, "case.work");
  return db.transaction(() => {
    const ep = db.prepare("SELECT id, participant_id FROM episodes WHERE id = ?").get(inp.episode_id) as { id: string; participant_id: string } | undefined;
    if (!ep) throw new DomainError("Episode tidak ditemukan.", 404);
    const id = nextId(db, "INV");
    const now = nowPrecise();
    db.prepare("INSERT INTO invitations (id, episode_id, participant_id, stage, mode, status, scheduled_for, sent_at, expires_at, subject_json, session_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?)").run(
      id, ep.id, ep.participant_id, inp.stage, inp.mode ?? "routine", inp.status ?? "sent", inp.scheduled_for ?? null, inp.status === "scheduled" ? null : now, addDays(nowIso(), inp.expires_in_days ?? 7), inp.subject ? JSON.stringify(inp.subject) : null, now,
    );
    appendAudit(db, { ...actorLike(by), action: "undangan_survei_dibuat", entity: "invitation", entity_id: id, detail: { episode: ep.id, tahap: inp.stage, mode: inp.mode ?? "routine" } });
    return id;
  })();
}

/** Konfirmasi terarah: satu pertanyaan tentang satu tindakan. Dipakai ketika dokumentasi pelaksanaan belum ditemukan (T1); jawabannya hanya menambah/mengurangi sinyal. */
export function createDirectedInvitation(db: Database.Database, by: Actor | Principal, inp: { episode_id: string; service_id: string; expires_in_days?: number }) {
  const svc = db.prepare("SELECT id, code, name, performed_at FROM services WHERE id = ? AND episode_id = ?").get(inp.service_id, inp.episode_id) as { id: string; code: string; name: string; performed_at: string } | undefined;
  if (!svc) throw new DomainError("Layanan tidak ditemukan pada episode ini.", 404);
  const dup = db.prepare("SELECT id FROM invitations WHERE episode_id = ? AND mode = 'directed' AND status IN ('sent','opened') AND json_extract(subject_json, '$.service_id') = ?").get(inp.episode_id, inp.service_id) as { id: string } | undefined;
  if (dup) return dup.id;
  const lay = serviceLay(svc.code, svc.name);
  return createInvitation(db, by, {
    episode_id: inp.episode_id, stage: "directed", mode: "directed", expires_in_days: inp.expires_in_days ?? 10,
    subject: { service_id: svc.id, service_code: svc.code, service_lay: lay.lay, service_desc: lay.desc, when: whenLabel(svc.performed_at) },
  });
}

/* ---------- Beranda ---------- */
export interface HomeView {
  participant: { pseudonym: string; name: string | null };
  respondent_role: "self" | "companion";
  companion_name: string | null;
  episodes: { id: string; facility_name: string; kind: string; admit_at: string; discharge_at: string; phase: string; surveys: { stage: Stage; label: string; state: "available" | "active" | "done"; session_id: string | null; status: string | null }[] }[];
  invitations: { id: string; stage: Stage; mode: "routine" | "directed"; label: string; detail: string; status: string; expires_at: string | null; session_id: string | null; facility_name: string }[];
  follow_ups: FollowUpView[];
  reports: ReportView[];
  open_helps: number;
}
export interface ReportView { id: string; category: string; category_label: string; text: string; status: string; status_label: string; hint: string; created_at: string; facility_name: string }
export interface FollowUpView { id: string; facility_name: string; description: string; due_at: string | null }

function ownParticipant(db: Database.Database, p: Principal) {
  assertCan(p, "survey.answer");
  if (!p.participantId) throw new AuthError("Akun ini tidak terkait dengan peserta.");
  assertParticipant(db, p, p.participantId);
  return p.participantId;
}

export function getHome(db: Database.Database, p: Principal): HomeView {
  const pid = ownParticipant(db, p);
  const resp = respondentRole(p);
  const part = db.prepare("SELECT pseudonym, name FROM participants WHERE id = ?").get(pid) as { pseudonym: string; name: string | null };
  const comp = p.companionId ? (db.prepare("SELECT name FROM companions WHERE id = ?").get(p.companionId) as { name: string } | undefined) : undefined;
  const eps = db.prepare("SELECT e.id, e.kind, e.admit_at, e.discharge_at, e.phase, f.name AS facility_name FROM episodes e JOIN facilities f ON f.id = e.facility_id WHERE e.participant_id = ? ORDER BY e.admit_at DESC LIMIT 12").all(pid) as { id: string; kind: string; admit_at: string; discharge_at: string; phase: string; facility_name: string }[];
  const sess = db.prepare("SELECT id, episode_id, stage, status, respondent_role FROM survey_sessions WHERE participant_id = ? AND mode = 'routine' AND is_sandbox = 0").all(pid) as { id: string; episode_id: string; stage: Stage; status: string; respondent_role: string }[];
  const episodes = eps.map((e) => {
    const stages: Stage[] = e.phase === "pre" ? ["pre"] : e.phase === "intra" ? ["intra"] : ["post"];
    return {
      id: e.id, facility_name: e.facility_name, kind: e.kind === "RITL" ? "Rawat inap" : "Rawat jalan", admit_at: e.admit_at, discharge_at: e.discharge_at, phase: e.phase,
      surveys: stages.map((st) => {
        const mine = sess.find((x) => x.episode_id === e.id && x.stage === st && x.respondent_role === resp);
        const any = sess.find((x) => x.episode_id === e.id && x.stage === st && ["completed", "partial"].includes(x.status));
        const state: "available" | "active" | "done" = mine?.status === "active" ? "active" : mine || any ? "done" : "available";
        return { stage: st, label: STAGE_LABEL[st], state, session_id: mine?.id ?? null, status: mine ? SESSION_LABEL[mine.status as keyof typeof SESSION_LABEL] : any ? SESSION_LABEL[any.status as keyof typeof SESSION_LABEL] : null };
      }),
    };
  });
  const inv = db.prepare("SELECT i.*, f.name AS facility_name FROM invitations i JOIN episodes e ON e.id = i.episode_id JOIN facilities f ON f.id = e.facility_id WHERE i.participant_id = ? AND i.status IN ('sent','opened') ORDER BY i.created_at DESC").all(pid) as (Record<string, unknown> & { id: string; stage: Stage; mode: "routine" | "directed"; status: string; expires_at: string | null; subject_json: string | null; session_id: string | null; facility_name: string })[];
  const invitations = inv.filter((i) => !i.expires_at || i.expires_at >= nowIso()).map((i) => {
    const sub = json<DirectedSubject | null>(i.subject_json, null);
    return {
      id: i.id, stage: i.stage, mode: i.mode, status: i.status, expires_at: i.expires_at, session_id: i.session_id, facility_name: i.facility_name,
      label: i.mode === "directed" ? "Satu pertanyaan singkat" : STAGE_LABEL[i.stage],
      detail: sub ? `Tentang ${sub.service_lay}, ${sub.when}.` : "Beberapa pertanyaan tentang pengalaman Anda.",
    };
  });
  return {
    participant: { pseudonym: part.pseudonym, name: part.name }, respondent_role: resp, companion_name: comp?.name ?? null, episodes, invitations,
    follow_ups: listFollowUps(db, p), reports: listReports(db, p), open_helps: (db.prepare("SELECT COUNT(*) n FROM help_requests WHERE participant_id = ? AND status = 'open'").get(pid) as { n: number }).n,
  };
}

/* ---------- Laporan kendala ---------- */
export function createServiceReport(db: Database.Database, p: Principal, inp: { episode_id: string; category: string; text: string; idem_key?: string }) {
  assertCan(p, "report.create");
  const pid = ownParticipant(db, p);
  const cat = REPORT_CATEGORIES.find((c) => c.id === inp.category);
  if (!cat) throw new DomainError("Kategori laporan tidak dikenal.", 422);
  const text = inp.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length < 8) throw new DomainError("Ceritakan kendala Anda dengan lebih lengkap (minimal 8 karakter).", 422);
  if (text.length > 1000) throw new DomainError("Laporan terlalu panjang (maksimal 1000 karakter).", 422);
  const ep = db.prepare("SELECT id, participant_id, facility_id FROM episodes WHERE id = ?").get(inp.episode_id) as { id: string; participant_id: string; facility_id: string } | undefined;
  if (!ep || ep.participant_id !== pid) throw new DomainError("Episode tidak ditemukan.", 404);
  const r = idempotent(db, `survey.report:${pid}`, inp.idem_key, () =>
    db.transaction(() => {
      const open = listReports(db, p).filter((x) => OPEN_REPORT.has(x.status)).length;
      if (open >= 10) throw new DomainError("Ada terlalu banyak laporan yang masih berjalan. Tunggu sebagian selesai ditangani.", 409, "too_many_open");
      const id = nextId(db, "SRQ");
      db.prepare("INSERT INTO service_requests (id, participant_id, episode_id, facility_id, category, text, status, respondent_role, created_at, idem_key) VALUES (?,?,?,?,?,?,'received',?,?,?)").run(id, pid, ep.id, ep.facility_id, cat.id, text, respondentRole(p), nowPrecise(), inp.idem_key ?? null);
      const neutral = findForbiddenTerms(text).length === 0;
      const f = createFinding(db, SYSTEM_ACTOR, {
        type: "T4", source: "participant_report", episode_id: ep.id, facility_id: ep.facility_id, title: `Laporan peserta: ${cat.label}`,
        summary: `Peserta melaporkan kendala kategori ${cat.label.toLowerCase()}${respondentRole(p) === "companion" ? " (disampaikan pendamping)" : ""}. ${neutral ? `Isi laporan: "${text.slice(0, 300)}${text.length > 300 ? "..." : ""}"` : "Isi laporan memuat kata yang tidak netral; baca teks aslinya pada permintaan layanan."} Belum diverifikasi.`,
        limit_text: "Laporan peserta adalah informasi awal, bukan bukti. Perlu dicocokkan dengan catatan faskes.", signals: [{ key: "laporan_peserta", label: `Laporan peserta (${cat.label})`, weight: 40 }], score: 40, dedupe_key: `T4:REPORT:${id}`, category: cat.id,
      });
      db.prepare("UPDATE service_requests SET case_id = ?, finding_id = ?, status = 'in_review' WHERE id = ?").run(f.caseId, f.findingId, id);
      appendAudit(db, { ...actorLike(p), action: "laporan_kendala_dibuat", entity: "service_request", entity_id: id, detail: { kategori: cat.id, temuan: f.findingId, responden: respondentRole(p) } });
      return id;
    })(),
  );
  return { id: r.value, replayed: r.replayed };
}

/** Status untuk peserta diturunkan dari keadaan temuan, klarifikasi, dan tindakan perbaikan (satu sumber kebenaran: modul kasus). Tidak ada yang menulis ke tabel permintaan layanan. */
export function deriveReportStatus(db: Database.Database, r: { status: string; finding_id: string | null }): string {
  if (!r.finding_id) return r.status;
  const f = db.prepare("SELECT proof_status FROM findings WHERE id = ?").get(r.finding_id) as { proof_status: string } | undefined;
  if (!f) return r.status;
  const acts = db.prepare("SELECT status FROM improvement_actions WHERE finding_id = ?").all(r.finding_id) as { status: string }[];
  if (acts.length) {
    if (acts.some((a) => a.status === "open" || a.status === "in_progress")) return "action";
    if (acts.some((a) => a.status === "resolved" || a.status === "follow_up_pending")) return "resolved";
    return "closed";
  }
  switch (f.proof_status) {
    case "awaiting_clarification": return "clarification";
    case "under_review":
    case "verified": return "in_review";
    case "not_verified":
    case "inconclusive": return "closed";
    default: return "received";
  }
}
const OPEN_REPORT = new Set(["received", "in_review", "clarification", "action"]);

export function listReports(db: Database.Database, p: Principal): ReportView[] {
  const pid = ownParticipant(db, p);
  const rows = db.prepare("SELECT r.*, f.name AS facility_name FROM service_requests r JOIN facilities f ON f.id = r.facility_id WHERE r.participant_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 20").all(pid) as { id: string; category: string; text: string; status: string; finding_id: string | null; created_at: string; facility_name: string }[];
  return rows.map((r) => {
    const status = deriveReportStatus(db, r);
    return {
      id: r.id, category: r.category, category_label: REPORT_CATEGORIES.find((c) => c.id === r.category)?.label ?? r.category, text: r.text, status,
      status_label: REPORT_STATUS_LABEL[status]?.label ?? status, hint: REPORT_STATUS_LABEL[status]?.hint ?? "", created_at: r.created_at, facility_name: r.facility_name,
    };
  });
}

/* ---------- Bantuan ---------- */
export function requestHelp(db: Database.Database, p: Principal, inp: { session_id?: string; episode_id?: string; reason: string; idem_key?: string }) {
  const pid = ownParticipant(db, p);
  const reason = inp.reason.replace(/\s+/g, " ").trim();
  if (reason.length < 3) throw new DomainError("Tuliskan singkat bantuan yang Anda perlukan.", 422);
  if (reason.length > 500) throw new DomainError("Maksimal 500 karakter.", 422);
  const r = idempotent(db, `survey.help:${pid}`, inp.idem_key, () =>
    db.transaction(() => {
      if (inp.session_id) {
        const s = db.prepare("SELECT participant_id FROM survey_sessions WHERE id = ?").get(inp.session_id) as { participant_id: string } | undefined;
        if (!s || s.participant_id !== pid) throw new DomainError("Sesi tidak ditemukan.", 404);
      }
      const id = nextId(db, "HLP");
      db.prepare("INSERT INTO help_requests (id, session_id, participant_id, episode_id, reason, status, channel, created_at) VALUES (?,?,?,?,?,'open','app',?)").run(id, inp.session_id ?? null, pid, inp.episode_id ?? null, reason, nowPrecise());
      appendAudit(db, { ...actorLike(p), action: "permintaan_bantuan_dibuat", entity: "help_request", entity_id: id, detail: { sesi: inp.session_id ?? null, saluran: "app" } });
      getAdapters(db).notification.notify({ to_role: "verifikator", topic: "bantuan_peserta", body: "Seorang peserta meminta bantuan petugas.", ref_type: "help_request", ref_id: id });
      return id;
    })(),
  );
  return { id: r.value, replayed: r.replayed };
}

export function handleHelp(db: Database.Database, p: Principal, helpId: string) {
  assertCan(p, "help.handle");
  db.transaction(() => {
    const h = db.prepare("SELECT status FROM help_requests WHERE id = ?").get(helpId) as { status: string } | undefined;
    if (!h) throw new DomainError("Permintaan bantuan tidak ditemukan.", 404);
    if (h.status !== "open") return;
    db.prepare("UPDATE help_requests SET status = 'handled', handled_by = ?, handled_at = ? WHERE id = ?").run(p.id, nowPrecise(), helpId);
    appendAudit(db, { ...actorLike(p), action: "permintaan_bantuan_ditangani", entity: "help_request", entity_id: helpId, detail: {} });
  })();
}

/* ---------- Konfirmasi tindak lanjut ---------- */
export function listFollowUps(db: Database.Database, p: Principal): FollowUpView[] {
  const pid = ownParticipant(db, p);
  const rows = db.prepare(
    "SELECT fu.id, fu.due_at, a.description, f.name AS facility_name FROM follow_ups fu JOIN improvement_actions a ON a.id = fu.action_id JOIN facilities f ON f.id = a.facility_id WHERE fu.kind = 'participant_confirmation' AND fu.status = 'pending' AND fu.participant_id = ? ORDER BY fu.created_at DESC",
  ).all(pid) as { id: string; due_at: string | null; description: string; facility_name: string }[];
  return rows.map((r) => ({ id: r.id, facility_name: r.facility_name, description: r.description, due_at: r.due_at }));
}
export function answerFollowUp(db: Database.Database, p: Principal, inp: { follow_up_id: string; outcome: "resolved" | "still_issue"; note?: string }) {
  ownParticipant(db, p);
  if (!["resolved", "still_issue"].includes(inp.outcome)) throw new DomainError("Pilihan tidak sah.", 422);
  completeFollowUp(db, p, inp.follow_up_id, inp.outcome, (inp.note ?? "").slice(0, 500));
}

/* ---------- Riwayat jawaban ---------- */
export interface HistoryView {
  sessions: { id: string; stage: Stage; stage_label: string; status: string; started_at: string | null; facility_name: string; respondent_role: "self" | "companion"; facts: { slot_label: string; value_label: string; origin: string }[] }[];
}
export function answerHistory(db: Database.Database, p: Principal): HistoryView {
  const pid = ownParticipant(db, p);
  const rows = db.prepare("SELECT s.id, s.stage, s.status, s.started_at, s.respondent_role, s.indicator_versions_json, f.name AS facility_name FROM survey_sessions s JOIN facilities f ON f.id = s.facility_id WHERE s.participant_id = ? AND s.is_sandbox = 0 ORDER BY s.started_at DESC").all(pid) as { id: string; stage: Stage; status: string; started_at: string | null; respondent_role: "self" | "companion"; indicator_versions_json: string; facility_name: string }[];
  return {
    sessions: rows.map((r) => ({
      id: r.id, stage: r.stage, stage_label: STAGE_LABEL[r.stage], status: SESSION_LABEL[r.status as keyof typeof SESSION_LABEL] ?? r.status, started_at: r.started_at, facility_name: r.facility_name, respondent_role: r.respondent_role,
      facts: describeFacts(db, r.id),
    })),
  };
}
