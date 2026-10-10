import { createHmac, timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";

/* Peran dan hak akses. Ditegakkan di server (fungsi domain memanggil assertCan/assertFacility/assertParticipant).
   Pemetaan dari peran demo lama: casemix → faskes, dokter → faskes (klinisi), verifikator → verifikator, auditor → reviewer/auditor. */

export type Role = "peserta" | "pendamping" | "faskes" | "verifikator" | "reviewer" | "auditor" | "admin";
export const ROLES: Role[] = ["peserta", "pendamping", "faskes", "verifikator", "reviewer", "auditor", "admin"];

export const ROLE_LABEL: Record<Role, string> = {
  peserta: "Peserta",
  pendamping: "Pendamping peserta",
  faskes: "Petugas faskes",
  verifikator: "Verifikator",
  reviewer: "Reviewer",
  auditor: "Auditor",
  admin: "Admin sistem",
};
export const ROLE_HINT: Record<Role, string> = {
  peserta: "Menjawab survei, melapor kendala, mengonfirmasi penyelesaian",
  pendamping: "Menjawab atas nama peserta yang mengotorisasi",
  faskes: "Menjawab klarifikasi, mengunggah bukti, menyusun rencana tindakan (hanya faskes sendiri)",
  verifikator: "Memeriksa kasus, meminta klarifikasi, mengajukan hasil pembuktian",
  reviewer: "Menyetujui hasil pembuktian dan peninjauan standar; meninjau AI",
  auditor: "Menelusuri audit, menyetujui eskalasi kedua, melihat evaluasi AI",
  admin: "Mengelola konfigurasi, standar, impor, dan AI",
};
/** Peran staf internal (non-peserta, non-faskes). */
export const INTERNAL_ROLES: Role[] = ["verifikator", "reviewer", "auditor", "admin"];

export type Capability =
  | "survey.answer"
  | "report.create"
  | "followup.confirm"
  | "case.view"
  | "case.assign"
  | "case.work"
  | "case.review"
  | "case.cause"
  | "fraud.escalate"
  | "claimreview.record"
  | "facility.respond"
  | "facility.report"
  | "action.manage"
  | "dispute.create"
  | "dispute.resolve"
  | "standards.view"
  | "standards.edit"
  | "standards.review"
  | "standards.approve"
  | "ai.view"
  | "ai.config"
  | "ai.sandbox"
  | "ai.eval"
  | "import.run"
  | "audit.view"
  | "audit.verify"
  | "pending.manage"
  | "cards.view"
  | "cards.configure"
  | "payments.view"
  | "evidence.upload"
  | "evidence.review"
  | "precheck.use"
  | "quality.view"
  | "help.handle";

const staff: Capability[] = ["case.view", "standards.view", "quality.view", "cards.view", "payments.view"];

const CAPS: Record<Role, Capability[]> = {
  peserta: ["survey.answer", "report.create", "followup.confirm"],
  pendamping: ["survey.answer", "report.create", "followup.confirm"],
  faskes: ["facility.respond", "facility.report", "action.manage", "dispute.create", "evidence.upload", "precheck.use", "standards.view"],
  verifikator: [...staff, "case.work", "claimreview.record", "evidence.upload", "evidence.review", "pending.manage", "precheck.use", "ai.view", "help.handle", "case.assign"],
  reviewer: [
    ...staff, "case.work", "case.assign", "case.review", "case.cause", "fraud.escalate", "claimreview.record", "evidence.review", "evidence.upload",
    "standards.review", "dispute.resolve", "pending.manage", "ai.view", "ai.eval", "audit.view", "help.handle", "cards.configure",
  ],
  auditor: [...staff, "audit.view", "audit.verify", "fraud.escalate", "ai.view", "ai.eval", "standards.review", "dispute.resolve"],
  admin: [
    ...staff, "case.assign", "standards.edit", "standards.review", "standards.approve", "ai.view", "ai.config", "ai.sandbox", "ai.eval", "import.run",
    "audit.view", "audit.verify", "pending.manage", "cards.configure", "evidence.upload", "help.handle", "precheck.use",
  ],
};

export interface Principal {
  /** ID stabil aktor di jejak audit, mis. "verifikator:U-VER-1". */
  id: string;
  name: string;
  role: Role;
  facilityId: string | null;
  participantId: string | null;
  companionId: string | null;
}

export class AuthError extends Error {
  constructor(message: string, public status: 401 | 403 = 403) {
    super(message);
  }
}

export function can(p: Principal, cap: Capability) {
  return CAPS[p.role].includes(cap);
}
export function assertCan(p: Principal, cap: Capability) {
  if (!can(p, cap)) throw new AuthError(`Peran ${ROLE_LABEL[p.role]} tidak berwenang untuk aksi ini (${cap}).`);
}
export const isInternal = (p: Principal) => INTERNAL_ROLES.includes(p.role);

/** Faskes hanya boleh menyentuh data faskesnya sendiri; staf internal boleh semua. */
export function assertFacility(p: Principal, facilityId: string) {
  if (p.role === "faskes" && p.facilityId !== facilityId) throw new AuthError("Akses lintas faskes ditolak.");
  if (p.role === "peserta" || p.role === "pendamping") throw new AuthError("Peserta tidak memiliki akses ke data faskes.");
}

/** Peserta hanya boleh menyentuh datanya; pendamping hanya bila diotorisasi. */
export function assertParticipant(db: Database.Database, p: Principal, participantId: string) {
  if (isInternal(p)) return;
  if (p.role === "peserta") {
    if (p.participantId !== participantId) throw new AuthError("Anda hanya dapat mengakses data Anda sendiri.");
    return;
  }
  if (p.role === "pendamping") {
    if (p.participantId !== participantId || !p.companionId) throw new AuthError("Pendamping tidak terkait dengan peserta ini.");
    const c = db.prepare("SELECT authorized FROM companions WHERE id = ? AND participant_id = ?").get(p.companionId, participantId) as { authorized: number } | undefined;
    if (!c || !c.authorized) throw new AuthError("Pendamping belum diotorisasi oleh peserta.");
    return;
  }
  throw new AuthError("Peran ini tidak memiliki akses ke data peserta.");
}

export function respondentRole(p: Principal): "self" | "companion" {
  return p.role === "pendamping" ? "companion" : "self";
}

/** Aktor untuk jejak audit. */
export const actorOf = (p: Principal) => p.id;

// ---------- Cookie sesi demo (ditandatangani HMAC; pemilih peran hanya untuk demo data sintetis) ----------
const SECRET = () => process.env.SEHATI_SESSION_SECRET ?? "sehati-demo-secret-ganti-di-produksi";
const b64 = (s: string) => Buffer.from(s).toString("base64url");

export function signSession(p: Principal): string {
  const body = b64(JSON.stringify(p));
  const mac = createHmac("sha256", SECRET()).update(body).digest("base64url");
  return `${body}.${mac}`;
}
export function readSession(raw: string | undefined | null): Principal | null {
  if (!raw) return null;
  const [body, mac] = raw.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", SECRET()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Principal;
    return ROLES.includes(p.role) ? p : null;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "sehati_session";
