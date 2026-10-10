import type Database from "better-sqlite3";
import { appendAudit } from "../audit";
import { assertCan, assertFacility, type Principal } from "../auth/principal";
import { SYSTEM_ACTOR, createFinding, type Actor } from "../cases/core";
import { checkServices, codingIssue, detectForClaim, loadSignalCtx, membershipIssue, SIGNAL_THRESHOLD, type SignalCtx } from "../cases/signals";
import { nowIso, nowPrecise } from "../clock";
import { dayDiff } from "../dates";
import { nextId } from "../db";
import { DomainError } from "../idem";
import { PENDING_LABEL, findForbiddenTerms } from "../labels";

/* Pemilahan klaim pending. Label awal adalah KATEGORI PENANGANAN (siapa melakukan apa), bukan penyebab final dan bukan dugaan fraud.
   Sumber label: kode alasan dari pihak pembayar (payment_events.reason) ditambah pemeriksaan mesin yang independen.
   Tabel ground_truth TIDAK dibaca di sini (hanya untuk evaluasi). Tidak ada kode di modul ini yang mengubah tabel claims (aturan I7). */

export type PendingCategory = keyof typeof PENDING_LABEL;
export type PendingStatus = "open" | "responded" | "resolved" | "escalated_to_case";
export const PENDING_CATEGORIES = Object.keys(PENDING_LABEL) as PendingCategory[];

export const PENDING_STATUS_LABEL: Record<PendingStatus, { label: string; tone: "muted" | "info" | "warn" | "ok" }> = {
  open: { label: "Menunggu faskes", tone: "warn" },
  responded: { label: "Sudah dijawab faskes", tone: "info" },
  resolved: { label: "Selesai", tone: "ok" },
  escalated_to_case: { label: "Dipindah ke kasus", tone: "info" },
};

export const OWNER_LABEL: Record<string, string> = {
  faskes: "Faskes (casemix/koder)",
  verifikator: "Verifikator",
  reviewer: "Reviewer",
};

interface ReasonRule { category: PendingCategory; owner: string; guidance: string }

/** Peta kode alasan → kategori penanganan. Kode di luar peta masuk "perlu pendalaman" (bukan ditebak). */
export const REASON_RULES: Record<string, ReasonRule> = {
  BERKAS_KURANG: {
    category: "doc_completeness", owner: "faskes",
    guidance: "Lengkapi berkas pendukung yang diminta (mis. resume medis, lembar tindakan, surat eligibilitas), unggah sebagai dokumen bukti, lalu jalankan pemeriksaan pra-pengajuan sebelum mengajukan ulang.",
  },
  KODING_TIDAK_SELARAS: {
    category: "coding", owner: "faskes",
    guidance: "Periksa kembali kode diagnosis/prosedur dan grup tarif terhadap resume medis. Bila kode benar, lampirkan dasar klinisnya; bila keliru, perbaiki kode lalu ajukan ulang.",
  },
  DATA_KEPESERTAAN: {
    category: "data_mismatch", owner: "faskes",
    guidance: "Cek status dan masa berlaku penjaminan peserta pada tanggal perawatan. Bila data peserta di faskes berbeda dari data penjaminan, perbarui data atau jelaskan selisihnya pada jawaban.",
  },
  DATA_TIDAK_SELARAS: {
    category: "data_mismatch", owner: "faskes",
    guidance: "Samakan data klaim dengan dokumen sumber (tanggal, diagnosis, rincian layanan). Jelaskan bagian yang berbeda bila perbedaan memang sah.",
  },
  PERLU_PENDALAMAN: {
    category: "needs_review", owner: "verifikator",
    guidance: "Perlu pendalaman oleh verifikator: kumpulkan bukti, minta klarifikasi spesifik kepada faskes bila perlu. Kategori ini bukan penyebab final dan bukan dugaan fraud.",
  },
};
const UNKNOWN_RULE: ReasonRule = {
  category: "needs_review", owner: "verifikator",
  guidance: "Kode alasan tidak dikenal oleh pemetaan saat ini, sehingga dipilah ke pendalaman. Verifikator menentukan kategori penanganan yang tepat.",
};

export const CATEGORY_GUIDANCE: Record<PendingCategory, { owner: string; guidance: string }> = {
  doc_completeness: { owner: "faskes", guidance: REASON_RULES.BERKAS_KURANG.guidance },
  coding: { owner: "faskes", guidance: REASON_RULES.KODING_TIDAK_SELARAS.guidance },
  data_mismatch: { owner: "faskes", guidance: REASON_RULES.DATA_TIDAK_SELARAS.guidance },
  needs_review: { owner: "verifikator", guidance: REASON_RULES.PERLU_PENDALAMAN.guidance },
};

export const PENDING_NOTE =
  "Kategori ini adalah cara penanganan awal. Bukan penyebab final dan bukan dugaan fraud. Pending yang tinggi pada satu faskes juga bukan pernyataan fraud.";

export interface Observation { area: string; text: string; tone: "ok" | "info" | "warn" }

/** Pemeriksaan mesin independen sebagai pembanding kode alasan. Hanya menampilkan apa yang terlihat pada data; tidak menyimpulkan penyebab. */
export function observationsFor(ctx: SignalCtx, claimId: string): Observation[] {
  const claim = ctx.claim.get(claimId);
  if (!claim) return [];
  const out: Observation[] = [];
  const mem = membershipIssue(ctx, claim);
  out.push(mem ? { area: "Kepesertaan", text: mem, tone: "warn" } : { area: "Kepesertaan", text: "Masa penjaminan mencakup tanggal perawatan.", tone: "ok" });
  const cod = codingIssue(ctx, claim);
  out.push(cod ? { area: "Koding", text: cod, tone: "warn" } : { area: "Koding", text: "Grup tarif selaras dengan kelompok diagnosis pada katalog simulasi.", tone: "ok" });
  const checks = checkServices(ctx, claim);
  const missing = checks.filter((c) => c.state === "kurang");
  const conflict = checks.filter((c) => c.state === "bertentangan");
  if (missing.length) out.push({ area: "Dokumentasi pelaksanaan", text: `${missing.length} layanan belum memiliki catatan pelaksanaan yang tertaut. Belum berarti layanan tidak dikerjakan.`, tone: "warn" });
  if (conflict.length) out.push({ area: "Dokumentasi pelaksanaan", text: `${conflict.length} layanan memiliki catatan yang tidak konsisten dengan tagihan (waktu/pelaksana).`, tone: "warn" });
  if (!missing.length && !conflict.length) out.push({ area: "Dokumentasi pelaksanaan", text: checks.length ? "Catatan pelaksanaan konsisten dengan rincian tagihan." : "Tidak ada rincian layanan untuk diperiksa (data belum cukup).", tone: checks.length ? "ok" : "info" });
  const sig = detectForClaim(ctx, claim).filter((d) => d.score >= SIGNAL_THRESHOLD);
  for (const d of sig) out.push({ area: "Kemiripan klaim", text: `${d.title} (kekuatan sinyal ${d.score}/100). Kandidat untuk diperiksa, bukan putusan.`, tone: "info" });
  return out;
}

interface PendingEvent { claim_id: string; type: "pending" | "returned"; at: string; reason: string | null }

function ruleFor(reason: string | null): ReasonRule {
  return (reason && REASON_RULES[reason]) || UNKNOWN_RULE;
}

/** Buat baris pemilahan untuk klaim pending/dikembalikan yang belum punya; tutup baris yang klaimnya sudah tidak pending. Idempoten. */
export function syncPendingTriage(db: Database.Database, by: Actor = SYSTEM_ACTOR) {
  const claims = db.prepare("SELECT id, claim_no, facility_id, submitted_at, status FROM claims WHERE status IN ('pending','returned') ORDER BY id").all() as { id: string; claim_no: string; facility_id: string; submitted_at: string | null; status: string }[];
  const events = db.prepare("SELECT claim_id, type, at, reason FROM payment_events WHERE type IN ('pending','returned') ORDER BY at, id").all() as PendingEvent[];
  const latest = new Map<string, PendingEvent>();
  for (const e of events) latest.set(e.claim_id, e);
  const existing = new Set((db.prepare("SELECT claim_id FROM pending_triage").all() as { claim_id: string }[]).map((r) => r.claim_id));
  let created = 0;
  let closed = 0;
  db.transaction(() => {
    for (const c of claims) {
      if (existing.has(c.id)) continue;
      const ev = latest.get(c.id);
      const rule = ruleFor(ev?.reason ?? null);
      const since = ev?.at ?? c.submitted_at ?? nowIso();
      const id = nextId(db, "TD");
      db.prepare("INSERT INTO pending_triage (id, claim_id, facility_id, reason_code, category, owner_role, guidance, pending_since, status, updated_at) VALUES (?,?,?,?,?,?,?,?, 'open', ?)").run(
        id, c.id, c.facility_id, ev?.reason ?? "TANPA_KODE", rule.category, rule.owner, rule.guidance, since, nowPrecise(),
      );
      appendAudit(db, { actor: by.id, actor_role: by.role, action: "pending_dipilah", entity: "pending_triage", entity_id: id, detail: { klaim: c.id, kode_alasan: ev?.reason ?? "TANPA_KODE", kategori: rule.category } });
      created++;
    }
    const stale = db.prepare("SELECT t.id, t.claim_id FROM pending_triage t JOIN claims c ON c.id = t.claim_id WHERE t.status IN ('open','responded') AND c.status NOT IN ('pending','returned')").all() as { id: string; claim_id: string }[];
    for (const s of stale) {
      db.prepare("UPDATE pending_triage SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ?").run(nowPrecise(), nowPrecise(), s.id);
      appendAudit(db, { actor: by.id, actor_role: by.role, action: "pending_selesai_otomatis", entity: "pending_triage", entity_id: s.id, detail: { klaim: s.claim_id, catatan: "status klaim tidak lagi pending pada sumber data" } });
      closed++;
    }
  })();
  return { created, closed };
}

export interface PendingRow {
  id: string; claim_id: string; claim_no: string; facility_id: string; facility_name: string; reason_code: string; category: PendingCategory;
  owner_role: string | null; guidance: string | null; pending_since: string; age_days: number; facility_response: string | null;
  status: PendingStatus; case_id: string | null; resolved_at: string | null; amount: number | null; claim_status: string; open_disputes: number;
}

export interface PendingFilter {
  facilityId?: string;
  category?: PendingCategory;
  status?: PendingStatus;
  owner?: string;
  minAgeDays?: number;
  q?: string;
}

const BASE_SQL = `
  SELECT t.id, t.claim_id, c.claim_no, t.facility_id, f.name AS facility_name, t.reason_code, t.category, t.owner_role, t.guidance, t.pending_since,
         t.facility_response, t.status, t.case_id, t.resolved_at, c.amount, c.status AS claim_status,
         (SELECT COUNT(*) FROM disputes d WHERE d.kind = 'pending_category' AND d.ref_id = t.id AND d.status = 'open') AS open_disputes
  FROM pending_triage t JOIN claims c ON c.id = t.claim_id JOIN facilities f ON f.id = t.facility_id`;

export function listPending(db: Database.Database, filter: PendingFilter = {}, now: string = nowIso()): PendingRow[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filter.facilityId) { where.push("t.facility_id = ?"); args.push(filter.facilityId); }
  if (filter.category) { where.push("t.category = ?"); args.push(filter.category); }
  if (filter.status) { where.push("t.status = ?"); args.push(filter.status); }
  if (filter.owner) { where.push("t.owner_role = ?"); args.push(filter.owner); }
  if (filter.q) { where.push("c.claim_no LIKE ?"); args.push(`%${filter.q.replace(/[%_]/g, "")}%`); }
  const rows = db.prepare(`${BASE_SQL} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY t.pending_since, t.id`).all(...args) as Omit<PendingRow, "age_days">[];
  const out = rows.map((r) => ({ ...r, age_days: Math.max(0, dayDiff(r.pending_since, now)) }));
  return filter.minAgeDays ? out.filter((r) => r.age_days >= filter.minAgeDays!) : out;
}

export function getPending(db: Database.Database, id: string, now: string = nowIso()): PendingRow | null {
  const r = db.prepare(`${BASE_SQL} WHERE t.id = ?`).get(id) as Omit<PendingRow, "age_days"> | undefined;
  return r ? { ...r, age_days: Math.max(0, dayDiff(r.pending_since, now)) } : null;
}

function mustPending(db: Database.Database, id: string) {
  const t = db.prepare("SELECT * FROM pending_triage WHERE id = ?").get(id) as { id: string; claim_id: string; facility_id: string; category: PendingCategory; status: PendingStatus; reason_code: string; facility_response: string | null } | undefined;
  if (!t) throw new DomainError("Baris pemilahan pending tidak ditemukan.", 404);
  return t;
}

const A = (a: Actor) => ({ actor: a.id, actor_role: a.role });
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
const netral = (s: string) => {
  const bad = findForbiddenTerms(s);
  if (bad.length) throw new DomainError(`Gunakan bahasa netral. Kata tidak diizinkan: ${bad.join(", ")}.`, 422);
};

/** Pemilah mengubah kategori penanganan (mis. setelah membaca jawaban faskes). Selalu beralasan dan tercatat. */
export function reclassifyPending(db: Database.Database, p: Principal, id: string, category: PendingCategory, reason: string) {
  assertCan(p, "pending.manage");
  return applyCategory(db, p, id, category, reason);
}
/** Dipakai juga oleh penyelesaian bantahan (wewenang diperiksa pemanggil). */
export function applyCategory(db: Database.Database, by: Actor, id: string, category: PendingCategory, reason: string) {
  if (!PENDING_CATEGORIES.includes(category)) throw new DomainError("Kategori tidak dikenal.", 422);
  const why = clean(reason);
  if (why.length < 10) throw new DomainError("Alasan perubahan kategori wajib diisi (minimal 10 karakter).", 422);
  netral(why);
  return db.transaction(() => {
    const t = mustPending(db, id);
    if (t.status === "resolved" || t.status === "escalated_to_case") throw new DomainError("Baris ini sudah selesai atau dipindah ke kasus.", 409);
    if (t.category === category) throw new DomainError("Kategori tidak berubah.", 422);
    const g = CATEGORY_GUIDANCE[category];
    db.prepare("UPDATE pending_triage SET category = ?, owner_role = ?, guidance = ?, updated_at = ? WHERE id = ?").run(category, g.owner, g.guidance, nowPrecise(), id);
    appendAudit(db, { ...A(by), action: "pending_dikategori_ulang", entity: "pending_triage", entity_id: id, detail: { dari: t.category, ke: category } });
    return category;
  })();
}

/** Faskes menjawab. Jawaban ditambahkan (riwayat tidak ditimpa) dengan cap waktu dan pelaku. */
export function respondPending(db: Database.Database, p: Principal, id: string, text: string, documentId?: string | null) {
  assertCan(p, "facility.respond");
  const t0 = clean(text);
  if (t0.length < 5) throw new DomainError("Jawaban terlalu singkat.", 422);
  if (t0.length > 4000) throw new DomainError("Jawaban terlalu panjang (maks. 4000 karakter).", 422);
  return db.transaction(() => {
    const t = mustPending(db, id);
    assertFacility(p, t.facility_id);
    if (t.status === "resolved" || t.status === "escalated_to_case") throw new DomainError("Baris ini sudah selesai atau dipindah ke kasus.", 409);
    if (documentId) {
      const d = db.prepare("SELECT facility_id FROM documents WHERE id = ?").get(documentId) as { facility_id: string } | undefined;
      if (!d || d.facility_id !== t.facility_id) throw new DomainError("Dokumen tidak ditemukan pada faskes ini.", 422);
    }
    const stamp = `[${nowPrecise().replace("T", " ")} · ${p.name}${documentId ? ` · dokumen ${documentId}` : ""}]`;
    const next = (t.facility_response ? t.facility_response + "\n\n" : "") + `${stamp}\n${t0}`;
    db.prepare("UPDATE pending_triage SET facility_response = ?, status = 'responded', updated_at = ? WHERE id = ?").run(next, nowPrecise(), id);
    appendAudit(db, { ...A(p), action: "pending_dijawab_faskes", entity: "pending_triage", entity_id: id, detail: { klaim: t.claim_id, dokumen: documentId ?? null } });
  })();
}

export function resolvePending(db: Database.Database, p: Principal, id: string, note: string) {
  assertCan(p, "pending.manage");
  const why = clean(note);
  if (why.length < 10) throw new DomainError("Catatan penyelesaian wajib diisi (minimal 10 karakter).", 422);
  netral(why);
  return db.transaction(() => {
    const t = mustPending(db, id);
    if (t.status === "resolved" || t.status === "escalated_to_case") throw new DomainError("Baris ini sudah selesai atau dipindah ke kasus.", 409);
    db.prepare("UPDATE pending_triage SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ?").run(nowPrecise(), nowPrecise(), id);
    appendAudit(db, { ...A(p), action: "pending_diselesaikan", entity: "pending_triage", entity_id: id, detail: { klaim: t.claim_id, catatan_panjang: why.length } });
  })();
}

/** Pemindahan ke ruang kasus hanya untuk kategori "perlu pendalaman", oleh manusia, dengan alasan. Hasilnya SINYAL (temuan jenis T5), bukan putusan. */
export function escalatePendingToCase(db: Database.Database, p: Principal, id: string, reason: string) {
  assertCan(p, "pending.manage");
  const why = clean(reason);
  if (why.length < 15) throw new DomainError("Alasan pemindahan wajib diisi (minimal 15 karakter).", 422);
  netral(why);
  return db.transaction(() => {
    const t = mustPending(db, id);
    if (t.status === "resolved" || t.status === "escalated_to_case") throw new DomainError("Baris ini sudah selesai atau dipindah ke kasus.", 409);
    if (t.category !== "needs_review") throw new DomainError("Hanya kategori 'Perlu pendalaman' yang dapat dipindah ke kasus. Ubah kategori dulu bila memang perlu pendalaman.", 422);
    const c = db.prepare("SELECT c.id, c.claim_no, c.episode_id, c.facility_id FROM claims c WHERE c.id = ?").get(t.claim_id) as { id: string; claim_no: string; episode_id: string; facility_id: string };
    const res = createFinding(db, p, {
      type: "T5", source: "pending", episode_id: c.episode_id, facility_id: c.facility_id, claim_id: c.id,
      title: `Klaim pending perlu pendalaman: ${c.claim_no}`,
      summary: `Klaim ${c.claim_no} dipilah ke "Perlu pendalaman" (kode alasan ${t.reason_code}). Dipindahkan oleh petugas untuk ditinjau. Ini kategori penanganan, belum penyebab dan bukan dugaan pelanggaran.`,
      limit_text: PENDING_NOTE, signals: [{ key: "pending_review", label: "Dipilah ke pendalaman oleh petugas", weight: 0 }], score: 0, dedupe_key: `PEND:${c.id}`,
    });
    db.prepare("UPDATE pending_triage SET status = 'escalated_to_case', case_id = ?, updated_at = ? WHERE id = ?").run(res.caseId, nowPrecise(), id);
    appendAudit(db, { ...A(p), action: "pending_dipindah_ke_kasus", entity: "pending_triage", entity_id: id, detail: { klaim: c.id, kasus: res.caseId, temuan: res.findingId } });
    return res;
  })();
}

export interface PendingStats {
  total: number;
  byCategory: Record<PendingCategory, number>;
  byStatus: Record<PendingStatus, number>;
  byOwner: Record<string, number>;
  avgAgeDays: number | null;
  oldestDays: number | null;
  responseRate: { responded: number; total: number };
  byFacility: { facility_id: string; facility_name: string; total: number; open: number; submitted: number; rate: number | null }[];
}

export function pendingStats(db: Database.Database, filter: PendingFilter = {}, now: string = nowIso()): PendingStats {
  const rows = listPending(db, filter, now);
  const byCategory = Object.fromEntries(PENDING_CATEGORIES.map((c) => [c, 0])) as Record<PendingCategory, number>;
  const byStatus: Record<PendingStatus, number> = { open: 0, responded: 0, resolved: 0, escalated_to_case: 0 };
  const byOwner: Record<string, number> = {};
  for (const r of rows) {
    byCategory[r.category]++;
    byStatus[r.status]++;
    const o = r.owner_role ?? "tidak ditentukan";
    byOwner[o] = (byOwner[o] ?? 0) + 1;
  }
  const active = rows.filter((r) => r.status === "open" || r.status === "responded");
  const ages = active.map((r) => r.age_days);
  const facs = db.prepare("SELECT f.id, f.name, (SELECT COUNT(*) FROM claims c WHERE c.facility_id = f.id AND c.submitted_at IS NOT NULL) AS submitted FROM facilities f WHERE f.kind = 'fkrtl' ORDER BY f.id").all() as { id: string; name: string; submitted: number }[];
  return {
    total: rows.length,
    byCategory,
    byStatus,
    byOwner,
    avgAgeDays: ages.length ? Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10 : null,
    oldestDays: ages.length ? Math.max(...ages) : null,
    responseRate: { responded: rows.filter((r) => r.facility_response).length, total: rows.length },
    byFacility: facs.map((f) => {
      const mine = rows.filter((r) => r.facility_id === f.id);
      return { facility_id: f.id, facility_name: f.name, total: mine.length, open: mine.filter((r) => r.status === "open").length, submitted: f.submitted, rate: f.submitted >= 20 ? mine.length / f.submitted : null };
    }),
  };
}

/** Observasi mesin untuk satu klaim pending (dimuat sekali per tampilan detail). */
export function pendingObservations(db: Database.Database, claimId: string) {
  return observationsFor(loadSignalCtx(db), claimId);
}

export const AGE_BUCKETS = [
  { key: "0", label: "Semua umur", min: 0 },
  { key: "7", label: "≥ 7 hari", min: 7 },
  { key: "14", label: "≥ 14 hari", min: 14 },
  { key: "30", label: "≥ 30 hari", min: 30 },
] as const;
