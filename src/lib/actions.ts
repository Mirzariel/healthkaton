import type Database from "better-sqlite3";
import { appendAudit } from "./audit";
import { recomputeParticipant } from "./db";
import type { ConfirmAnswer, Role } from "./types";

export const ROLES: Role[] = ["casemix", "verifikator", "auditor", "dokter"];
export const ROLE_LABEL: Record<Role, string> = {
  casemix: "Casemix RS",
  verifikator: "Verifikator",
  auditor: "Auditor",
  dokter: "Dokter DPJP",
};
export const DECISIONS = ["loloskan", "koreksi", "tolak", "eskalasi"] as const;
export type Decision = (typeof DECISIONS)[number];
export const DECISION_LABEL: Record<Decision | "dicabut_otomatis", string> = {
  loloskan: "Loloskan (sah)",
  koreksi: "Koreksi klaim",
  tolak: "Tolak klaim",
  eskalasi: "Eskalasi ke audit lanjutan",
  dicabut_otomatis: "Dicabut otomatis",
};

export class ActionError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const nowIso = () => new Date().toISOString().slice(0, 16);

function mustCase(db: Database.Database, id: string) {
  const c = db.prepare("SELECT * FROM cases WHERE id = ?").get(id) as
    | { id: string; status: string; finding_id: string; first_review_at: string | null }
    | undefined;
  if (!c) throw new ActionError("Kasus tidak ditemukan.", 404);
  return c;
}

export function assignCase(db: Database.Database, id: string, role: string, note: string, actor: Role) {
  const c = mustCase(db, id);
  if (c.status === "decided") throw new ActionError("Kasus sudah diputuskan.", 409);
  if (!ROLES.includes(role as Role)) throw new ActionError("Peran tujuan tidak dikenal.");
  if (actor === "dokter") throw new ActionError("Dokter tidak dapat menugaskan kasus.", 403);
  const now = nowIso();
  db.prepare("UPDATE cases SET assignee_role=?, assignee_note=?, first_review_at=COALESCE(first_review_at, ?) WHERE id=?").run(role, note || null, now, id);
  appendAudit(db, { actor, action: "kasus_ditugaskan", entity: "case", entity_id: id, detail: { kepada: role, catatan: note } });
}

export function postMessage(db: Database.Database, id: string, role: Role, text: string) {
  const c = mustCase(db, id);
  if (c.status === "decided") throw new ActionError("Kasus sudah diputuskan; percakapan ditutup.", 409);
  const t = text.trim();
  if (!t) throw new ActionError("Pesan tidak boleh kosong.");
  if (t.length > 2000) throw new ActionError("Pesan terlalu panjang (maks. 2000 karakter).");
  const now = nowIso();
  db.prepare("INSERT INTO messages (case_id, role, text, at) VALUES (?,?,?,?)").run(id, role, t, now);
  if (c.status === "open") {
    db.prepare("UPDATE cases SET status='clarification', first_review_at=COALESCE(first_review_at, ?) WHERE id=?").run(now, id);
  }
  appendAudit(db, { actor: role, action: "pesan_klarifikasi", entity: "case", entity_id: id, detail: { panjang: t.length } });
}

export function decideCase(
  db: Database.Database,
  id: string,
  p: { decision: string; reason: string; correction?: number | null },
  actor: Role,
) {
  const c = mustCase(db, id);
  if (c.status === "decided") throw new ActionError("Kasus sudah diputuskan.", 409);
  if (actor !== "verifikator" && actor !== "auditor") throw new ActionError("Hanya verifikator atau auditor yang dapat memutuskan.", 403);
  if (!(DECISIONS as readonly string[]).includes(p.decision)) throw new ActionError("Keputusan tidak valid.");
  const reason = p.reason.trim();
  if (reason.length < 10) throw new ActionError("Alasan keputusan wajib diisi (minimal 10 karakter).");
  const correction = p.decision === "koreksi" ? Math.max(0, Math.round(p.correction ?? 0)) : null;
  const now = nowIso();
  db.transaction(() => {
    db.prepare(
      "UPDATE cases SET status='decided', decision=?, decision_reason=?, correction_amount=?, decided_at=?, first_review_at=COALESCE(first_review_at, ?) WHERE id=?",
    ).run(p.decision, reason, correction, now, now, id);
    db.prepare("UPDATE findings SET status='closed' WHERE id=?").run(c.finding_id);
    appendAudit(db, { actor, action: "keputusan", entity: "case", entity_id: id, detail: { decision: p.decision, reason, correction } });
  })();
}

export function confirmService(
  db: Database.Database,
  serviceId: string,
  participantId: string,
  answer: string,
  note: string,
) {
  if (!["sesuai", "tidak_sesuai", "tidak_ingat"].includes(answer)) throw new ActionError("Jawaban tidak valid.");
  const row = db
    .prepare("SELECT s.id FROM services s JOIN episodes e ON e.id=s.episode_id WHERE s.id=? AND e.participant_id=?")
    .get(serviceId, participantId);
  if (!row) throw new ActionError("Layanan tidak ditemukan untuk peserta ini.", 404);
  const n = (db.prepare("SELECT COUNT(*) n FROM confirmations").get() as { n: number }).n;
  const now = nowIso();
  const cleanNote = note.trim().slice(0, 500);
  db.transaction(() => {
    db.prepare("INSERT INTO confirmations (id, service_id, participant_id, answer, note, at) VALUES (?,?,?,?,?,?)").run(
      `K-${String(n + 1).padStart(4, "0")}-${Date.now() % 100000}`,
      serviceId,
      participantId,
      answer as ConfirmAnswer,
      cleanNote,
      now,
    );
    appendAudit(db, { actor: "peserta", action: "konfirmasi_layanan", entity: "service", entity_id: serviceId, detail: { answer: answer, adaCatatan: cleanNote.length > 0 } });
  })();
  return recomputeParticipant(db, participantId, "sistem", now);
}
