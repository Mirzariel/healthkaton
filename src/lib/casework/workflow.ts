import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { getAdapters } from "../adapters";
import { appendAudit } from "../audit";
import { AuthError, assertCan, assertFacility, can, type Principal } from "../auth/principal";
import { SYSTEM_ACTOR, assertCaseAccess, getFinding, lapseOverdueClarifications, reopenFinding } from "../cases/core";
import { nowIso, nowPrecise } from "../clock";
import { getMeta, nextId, setMeta } from "../db";
import { PROOF_FINAL, CLARIFICATION_TRANSITIONS, assertMove } from "../domain/transitions";
import { DomainError } from "../idem";
import { findForbiddenTerms } from "../labels";

/* Fungsi domain modul kasus-faskes yang belum ada di cases/core.ts: bukti, pencarian, catatan, penarikan klarifikasi, bantahan, dokumen.
   Semua menerima `db` sebagai argumen pertama, memanggil assertCan/assertFacility, dan menulis audit di transaksi yang sama. */

const A = (p: Pick<Principal, "id" | "role">) => ({ actor: p.id, actor_role: p.role });

function mustFinding(db: Database.Database, id: string) {
  const f = getFinding(db, id);
  if (!f) throw new DomainError("Temuan tidak ditemukan.", 404);
  return f;
}

/* ---------- Catatan internal ---------- */
export function addNote(db: Database.Database, p: Principal, caseId: string, findingId: string | null, text: string) {
  assertCan(p, "case.work");
  const t = text.trim();
  if (t.length < 5) throw new DomainError("Catatan terlalu pendek.", 422);
  if (t.length > 2000) throw new DomainError("Catatan terlalu panjang (maks. 2000 karakter).", 422);
  return db.transaction(() => {
    const c = db.prepare("SELECT id, facility_id FROM cases WHERE id = ?").get(caseId) as { id: string; facility_id: string } | undefined;
    if (!c) throw new DomainError("Kasus tidak ditemukan.", 404);
    assertCaseAccess(p, c.facility_id);
    if (findingId && !db.prepare("SELECT 1 FROM findings WHERE id = ? AND case_id = ?").get(findingId, caseId)) throw new DomainError("Temuan bukan bagian dari kasus ini.", 422);
    const info = db.prepare("INSERT INTO case_notes (case_id, finding_id, author_id, author_role, text, at) VALUES (?,?,?,?,?,?)").run(caseId, findingId, p.id, p.role, t, nowPrecise());
    appendAudit(db, { ...A(p), action: "catatan_internal_ditambah", entity: "case", entity_id: caseId, detail: { temuan: findingId } });
    return Number(info.lastInsertRowid);
  })();
}

/* ---------- Bukti tertaut ---------- */
export interface LinkEvidenceInput {
  findingId: string;
  direction: "supports" | "contradicts" | "neutral";
  /** Salah satu: catatan pelaksanaan faskes (tabel evidence) atau dokumen yang diunggah faskes. */
  evidenceId?: string | null;
  documentId?: string | null;
  quote?: string | null;
  page?: number | null;
  note: string;
}

/** Petugas menautkan bukti ke temuan dengan arah (mendukung / bertentangan / netral). Arah dinilai petugas, bukan mesin. */
export function linkEvidence(db: Database.Database, p: Principal, i: LinkEvidenceInput) {
  assertCan(p, "evidence.review");
  const note = i.note.trim();
  if (note.length < 5) throw new DomainError("Catatan penilaian bukti wajib diisi (minimal 5 karakter).", 422);
  if (!!i.evidenceId === !!i.documentId) throw new DomainError("Pilih tepat satu: catatan pelaksanaan atau dokumen.", 422);
  const bad = findForbiddenTerms(note);
  if (bad.length) throw new DomainError(`Gunakan bahasa netral. Kata tidak diizinkan: ${bad.join(", ")}.`, 422);
  const quote = (i.quote ?? "").trim().slice(0, 400) || null;
  return db.transaction(() => {
    const f = mustFinding(db, i.findingId);
    assertCaseAccess(p, f.facility_id);
    if (PROOF_FINAL.includes(f.proof_status)) throw new DomainError("Temuan sudah berstatus akhir. Buka ulang dulu untuk menambah bukti.", 409);
    if (i.evidenceId) {
      const ev = db.prepare("SELECT id, episode_id FROM evidence WHERE id = ?").get(i.evidenceId) as { id: string; episode_id: string } | undefined;
      if (!ev || ev.episode_id !== f.episode_id) throw new DomainError("Catatan pelaksanaan tidak ditemukan pada episode temuan ini.", 422);
    }
    if (i.documentId) {
      const d = db.prepare("SELECT id, facility_id FROM documents WHERE id = ?").get(i.documentId) as { id: string; facility_id: string } | undefined;
      if (!d || d.facility_id !== f.facility_id) throw new DomainError("Dokumen tidak ditemukan pada faskes temuan ini.", 422);
    }
    const dup = db.prepare("SELECT 1 FROM evidence_links WHERE finding_id = ? AND COALESCE(evidence_id,'') = ? AND COALESCE(document_id,'') = ? AND direction = ?").get(f.id, i.evidenceId ?? "", i.documentId ?? "", i.direction);
    if (dup) throw new DomainError("Bukti ini sudah ditautkan dengan arah yang sama.", 409);
    const id = nextId(db, "EL");
    db.prepare("INSERT INTO evidence_links (id, finding_id, case_id, evidence_id, document_id, direction, quote, page, note, linked_by, linked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
      id, f.id, f.case_id, i.evidenceId ?? null, i.documentId ?? null, i.direction, quote, i.page ?? null, note, p.id, nowPrecise(),
    );
    appendAudit(db, { ...A(p), action: "bukti_ditautkan", entity: "finding", entity_id: f.id, detail: { tautan: id, arah: i.direction, sumber: i.evidenceId ? "catatan_pelaksanaan" : "dokumen" } });
    return id;
  })();
}

/* ---------- Catatan pencarian bukti ---------- */
export interface SearchInput {
  findingId: string;
  source: string;
  query: string;
  result: "found" | "not_found" | "inconsistent";
  foundRef?: string | null;
}

/** Mencatat pencarian bukti yang sudah dilakukan. 'Tidak dapat dibuktikan' hanya sah bila pencarian semacam ini tercatat. */
export function recordEvidenceSearch(db: Database.Database, p: Principal, i: SearchInput) {
  assertCan(p, "evidence.review");
  const source = i.source.trim();
  const query = i.query.trim();
  if (source.length < 2 || source.length > 80) throw new DomainError("Sumber yang dicari wajib diisi (2–80 karakter).", 422);
  if (query.length < 5 || query.length > 300) throw new DomainError("Uraikan apa yang dicari (5–300 karakter).", 422);
  return db.transaction(() => {
    const f = mustFinding(db, i.findingId);
    assertCaseAccess(p, f.facility_id);
    const info = db.prepare("INSERT INTO evidence_searches (claim_id, service_id, finding_id, source, query, result, found_ref, at, actor) VALUES (?,?,?,?,?,?,?,?,?)").run(
      f.claim_id, f.service_id, f.id, source, query, i.result, i.foundRef?.trim().slice(0, 120) || null, nowPrecise(), p.id,
    );
    appendAudit(db, { ...A(p), action: "pencarian_bukti_dicatat", entity: "finding", entity_id: f.id, detail: { hasil: i.result, sumber: source.slice(0, 40) } });
    return Number(info.lastInsertRowid);
  })();
}

/* ---------- Klarifikasi: penarikan ---------- */
export function withdrawClarification(db: Database.Database, p: Principal, clarificationId: string, reason: string) {
  assertCan(p, "case.work");
  if (reason.trim().length < 10) throw new DomainError("Alasan penarikan wajib diisi (minimal 10 karakter).", 422);
  db.transaction(() => {
    const c = db.prepare("SELECT id, finding_id, facility_id, status FROM clarifications WHERE id = ?").get(clarificationId) as { id: string; finding_id: string; facility_id: string; status: "sent" | "answered" | "lapsed" | "withdrawn" } | undefined;
    if (!c) throw new DomainError("Klarifikasi tidak ditemukan.", 404);
    assertCaseAccess(p, c.facility_id);
    assertMove("klarifikasi", CLARIFICATION_TRANSITIONS, c.status, "withdrawn");
    if (c.status !== "sent") throw new DomainError("Hanya klarifikasi yang masih menunggu jawaban yang dapat ditarik.", 409);
    db.prepare("UPDATE clarifications SET status = 'withdrawn' WHERE id = ?").run(c.id);
    db.prepare("INSERT INTO clarification_messages (clarification_id, author_role, author_id, text, document_id, at) VALUES (?,?,?,?,NULL,?)").run(c.id, p.role, p.id, `Permintaan ditarik petugas: ${reason.trim()}`, nowPrecise());
    // temuan yang menunggu klarifikasi ini kembali ditinjau bila tidak ada klarifikasi lain yang menunggu
    const f = c.finding_id ? getFinding(db, c.finding_id) : undefined;
    if (f && f.proof_status === "awaiting_clarification") {
      const other = db.prepare("SELECT 1 FROM clarifications WHERE finding_id = ? AND status = 'sent' AND id <> ?").get(f.id, c.id);
      if (!other) {
        db.prepare("UPDATE findings SET proof_status = 'under_review', updated_at = ? WHERE id = ?").run(nowPrecise(), f.id);
        appendAudit(db, { ...A(p), action: "status_pembuktian", entity: "finding", entity_id: f.id, detail: { dari: "awaiting_clarification", ke: "under_review", klarifikasi_ditarik: c.id } });
      }
    }
    appendAudit(db, { ...A(p), action: "klarifikasi_ditarik", entity: "clarification", entity_id: c.id, detail: {} });
  })();
}

/* ---------- Bantahan faskes ---------- */
/** Temuan baru terlihat oleh faskes setelah faskes diminta berpartisipasi (klarifikasi dikirim) atau ada tindakan perbaikan.
    Sinyal yang belum ditinjau tidak dibuka ke faskes: sinyal bukan putusan dan tidak boleh merugikan nama faskes lebih dulu. */
export const FACILITY_VISIBLE_SQL = `(
  EXISTS (SELECT 1 FROM clarifications c WHERE c.finding_id = f.id AND c.status <> 'withdrawn')
  OR EXISTS (SELECT 1 FROM improvement_actions a WHERE a.finding_id = f.id)
)`;

export function findingVisibleToFacility(db: Database.Database, findingId: string, facilityId: string) {
  return !!db.prepare(`SELECT 1 FROM findings f WHERE f.id = ? AND f.facility_id = ? AND ${FACILITY_VISIBLE_SQL}`).get(findingId, facilityId);
}

export function createDispute(db: Database.Database, p: Principal, findingId: string, text: string) {
  assertCan(p, "dispute.create");
  const t = text.trim();
  if (t.length < 20) throw new DomainError("Uraikan bantahan (minimal 20 karakter) dan sebutkan dasarnya.", 422);
  if (t.length > 2000) throw new DomainError("Bantahan terlalu panjang (maks. 2000 karakter).", 422);
  return db.transaction(() => {
    const f = mustFinding(db, findingId);
    assertFacility(p, f.facility_id);
    if (!findingVisibleToFacility(db, f.id, f.facility_id)) throw new DomainError("Temuan tidak ditemukan.", 404);
    const open = db.prepare("SELECT 1 FROM disputes WHERE kind = 'finding' AND ref_id = ? AND status = 'open'").get(f.id);
    if (open) throw new DomainError("Sudah ada bantahan atas temuan ini yang menunggu tanggapan.", 409);
    const id = nextId(db, "BN");
    db.prepare("INSERT INTO disputes (id, facility_id, kind, ref_id, text, status, created_by, created_at) VALUES (?,?,'finding',?,?,'open',?,?)").run(id, f.facility_id, f.id, t, p.id, nowPrecise());
    appendAudit(db, { ...A(p), action: "bantahan_diajukan", entity: "dispute", entity_id: id, detail: { temuan: f.id } });
    getAdapters(db).notification.notify({ to_role: "reviewer", topic: "Bantahan faskes", body: `Faskes mengajukan bantahan atas temuan ${f.id}.`, ref_type: "dispute", ref_id: id });
    return id;
  })();
}

export type DisputeDecision = "accepted" | "rejected" | "noted";
/** Reviewer/auditor menanggapi bantahan. Bantahan yang diterima atas temuan berstatus akhir membuka ulang temuan (hanya reviewer yang berwenang). */
export function resolveDispute(db: Database.Database, p: Principal, disputeId: string, decision: DisputeDecision, response: string) {
  assertCan(p, "dispute.resolve");
  if (response.trim().length < 10) throw new DomainError("Tanggapan wajib diisi (minimal 10 karakter).", 422);
  db.transaction(() => {
    const d = db.prepare("SELECT * FROM disputes WHERE id = ?").get(disputeId) as { id: string; facility_id: string; kind: string; ref_id: string; status: string } | undefined;
    if (!d) throw new DomainError("Bantahan tidak ditemukan.", 404);
    if (d.status !== "open") throw new DomainError("Bantahan sudah ditanggapi.", 409);
    if (d.kind !== "finding") throw new DomainError("Jenis bantahan ini ditanggapi pada modul pemiliknya.", 409);
    const f = mustFinding(db, d.ref_id);
    assertCaseAccess(p, f.facility_id);
    if (decision === "accepted" && PROOF_FINAL.includes(f.proof_status)) {
      if (!can(p, "case.review")) throw new AuthError("Bantahan atas temuan berstatus akhir hanya dapat diterima reviewer, karena membuka ulang temuan.");
      reopenFinding(db, p, f.id, `Bantahan faskes ${d.id} diterima: ${response.trim()}`.slice(0, 600));
    }
    db.prepare("UPDATE disputes SET status = ?, response = ?, resolved_by = ?, resolved_at = ? WHERE id = ?").run(decision, response.trim(), p.id, nowPrecise(), d.id);
    appendAudit(db, { ...A(p), action: "bantahan_ditanggapi", entity: "dispute", entity_id: d.id, detail: { keputusan: decision, temuan: f.id } });
    getAdapters(db).notification.notify({ to_role: "faskes", to_id: d.facility_id, topic: "Tanggapan bantahan", body: `Bantahan ${d.id} telah ditanggapi.`, ref_type: "dispute", ref_id: d.id });
  })();
}

/* ---------- Dokumen faskes ---------- */
export const DOC_MAX_BYTES = 3 * 1024 * 1024;
const DOCS_PER_FACILITY = 200;
export const DOC_TYPES = ["application/pdf", "image/png", "image/jpeg", "text/plain"] as const;
export type DocMime = (typeof DOC_TYPES)[number];

function sniff(bytes: Buffer): DocMime | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (!bytes.includes(0)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return "text/plain";
    } catch {
      return null;
    }
  }
  return null;
}

export interface AddDocumentInput {
  facilityId: string;
  name: string;
  bytes: Buffer;
  declaredMime?: string;
  clarificationId?: string | null;
  findingId?: string | null;
  /** Teks hasil ekstraksi PDF (dihitung pemanggil secara asinkron). Kosong/pendek = dianggap pindaian. */
  pdfText?: string | null;
  pdfPages?: number | null;
}

/** Simpan dokumen bukti. Jenis ditentukan dari ISI berkas (bukan nama atau tipe yang dikirim klien). Pindaian/gambar tanpa OCR masuk jalur transkripsi manual. */
export function addDocument(db: Database.Database, p: Principal, i: AddDocumentInput) {
  assertCan(p, "evidence.upload");
  if (!i.bytes.length) throw new DomainError("Berkas kosong.", 422);
  if (i.bytes.length > DOC_MAX_BYTES) throw new DomainError(`Berkas terlalu besar (maks. ${DOC_MAX_BYTES / 1024 / 1024} MB).`, 422);
  const mime = sniff(i.bytes);
  if (!mime) throw new DomainError("Jenis berkas tidak didukung. Gunakan PDF, PNG, JPEG, atau teks biasa.", 422);
  if (i.declaredMime && DOC_TYPES.includes(i.declaredMime as DocMime) && i.declaredMime !== mime) throw new DomainError("Isi berkas tidak sesuai dengan jenis yang dinyatakan.", 422);
  const name = i.name.replace(/[\\/]/g, "_").replace(/[^\p{L}\p{N}._() -]/gu, "").trim().slice(0, 120) || "dokumen";
  assertFacility(p, i.facilityId);
  return db.transaction(() => {
    const n = (db.prepare("SELECT COUNT(*) n FROM documents WHERE facility_id = ?").get(i.facilityId) as { n: number }).n;
    if (n >= DOCS_PER_FACILITY) throw new DomainError("Batas jumlah dokumen demo untuk faskes ini tercapai.", 422);
    let caseId: string | null = null;
    let episodeId: string | null = null;
    let findingId = i.findingId ?? null;
    if (i.clarificationId) {
      const c = db.prepare("SELECT id, case_id, finding_id, facility_id FROM clarifications WHERE id = ?").get(i.clarificationId) as { id: string; case_id: string; finding_id: string | null; facility_id: string } | undefined;
      if (!c || c.facility_id !== i.facilityId) throw new DomainError("Klarifikasi tidak ditemukan.", 404);
      caseId = c.case_id;
      findingId = findingId ?? c.finding_id;
    }
    if (findingId) {
      const f = mustFinding(db, findingId);
      if (f.facility_id !== i.facilityId) throw new AuthError("Akses lintas faskes ditolak.");
      caseId = caseId ?? f.case_id;
      episodeId = f.episode_id;
    }
    const kind = mime === "application/pdf" ? ((i.pdfText ?? "").trim().length >= 20 ? "pdf_text" : "pdf_scan") : mime === "text/plain" ? "text" : "image";
    const status = kind === "pdf_text" || kind === "text" ? "text_extracted" : "needs_manual_transcription";
    const id = nextId(db, "DOK");
    db.prepare("INSERT INTO documents (id, episode_id, facility_id, case_id, finding_id, clarification_id, name, mime, size, sha256, content, kind, page_count, processing_status, uploaded_by, uploaded_role, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      id, episodeId, i.facilityId, caseId, findingId, i.clarificationId ?? null, name, mime, i.bytes.length, createHash("sha256").update(i.bytes).digest("hex"), i.bytes, kind, i.pdfPages ?? null, status, p.id, p.role, nowPrecise(),
    );
    if (kind === "pdf_text" || kind === "text") {
      const text = kind === "text" ? i.bytes.toString("utf-8") : (i.pdfText ?? "");
      db.prepare("INSERT INTO extractions (id, document_id, page, engine, text, simulated, status, created_at) VALUES (?,?,NULL,?,?,0,'proposed',?)").run(nextId(db, "EXT"), id, kind === "text" ? "manual" : "pdf_text", text.slice(0, 20000), nowPrecise());
    }
    appendAudit(db, { ...A(p), action: "dokumen_diunggah", entity: "document", entity_id: id, detail: { jenis: kind, ukuran: i.bytes.length, klarifikasi: i.clarificationId ?? null } });
    return { id, kind, status };
  })();
}

/** Transkripsi manual dokumen pindaian/gambar (tanpa OCR). Hasilnya tetap usulan sampai petugas lain dapat menelaahnya; teks asli dokumen tidak berubah. */
export function transcribeDocument(db: Database.Database, p: Principal, documentId: string, text: string) {
  assertCan(p, "evidence.review");
  const t = text.trim();
  if (t.length < 10) throw new DomainError("Transkripsi terlalu pendek (minimal 10 karakter).", 422);
  if (t.length > 20000) throw new DomainError("Transkripsi terlalu panjang.", 422);
  return db.transaction(() => {
    const d = db.prepare("SELECT id, facility_id, processing_status, finding_id FROM documents WHERE id = ?").get(documentId) as { id: string; facility_id: string; processing_status: string; finding_id: string | null } | undefined;
    if (!d) throw new DomainError("Dokumen tidak ditemukan.", 404);
    assertCaseAccess(p, d.facility_id);
    if (d.processing_status !== "needs_manual_transcription") throw new DomainError("Dokumen ini tidak memerlukan transkripsi manual.", 409);
    const id = nextId(db, "EXT");
    db.prepare("INSERT INTO extractions (id, document_id, page, engine, text, simulated, status, reviewer, reviewed_at, created_at) VALUES (?,?,NULL,'manual',?,0,'proposed',?,?,?)").run(id, d.id, t, p.id, nowPrecise(), nowPrecise());
    db.prepare("UPDATE documents SET processing_status = 'reviewed' WHERE id = ?").run(d.id);
    appendAudit(db, { ...A(p), action: "dokumen_ditranskripsi_manual", entity: "document", entity_id: d.id, detail: { ekstraksi: id } });
    return id;
  })();
}

/** Petugas menelaah hasil ekstraksi teks: setujui apa adanya, koreksi, atau tolak. Teks sumber asli tetap tersimpan. */
export function reviewExtraction(db: Database.Database, p: Principal, extractionId: string, action: "confirm" | "correct" | "reject", correctedText?: string) {
  assertCan(p, "evidence.review");
  if (action === "correct" && (correctedText ?? "").trim().length < 5) throw new DomainError("Teks koreksi wajib diisi.", 422);
  db.transaction(() => {
    const x = db.prepare("SELECT x.id, x.status, d.facility_id, d.id doc FROM extractions x JOIN documents d ON d.id = x.document_id WHERE x.id = ?").get(extractionId) as { id: string; status: string; facility_id: string; doc: string } | undefined;
    if (!x) throw new DomainError("Ekstraksi tidak ditemukan.", 404);
    assertCaseAccess(p, x.facility_id);
    if (x.status !== "proposed") throw new DomainError("Ekstraksi ini sudah ditelaah.", 409);
    const status = action === "confirm" ? "confirmed" : action === "correct" ? "corrected" : "rejected";
    db.prepare("UPDATE extractions SET status = ?, corrected_text = ?, reviewer = ?, reviewed_at = ? WHERE id = ?").run(status, action === "correct" ? correctedText!.trim().slice(0, 20000) : null, p.id, nowPrecise(), x.id);
    db.prepare("UPDATE documents SET processing_status = 'reviewed' WHERE id = ?").run(x.doc);
    appendAudit(db, { ...A(p), action: "ekstraksi_ditelaah", entity: "document", entity_id: x.doc, detail: { ekstraksi: x.id, hasil: status } });
  })();
}

/** Izin membaca dokumen: staf berwenang, atau faskes pemiliknya. Peserta tidak pernah. */
export function assertDocumentAccess(db: Database.Database, p: Principal, documentId: string) {
  const d = db.prepare("SELECT id, facility_id FROM documents WHERE id = ?").get(documentId) as { id: string; facility_id: string } | undefined;
  if (!d) throw new DomainError("Dokumen tidak ditemukan.", 404);
  if (p.role === "faskes") {
    assertFacility(p, d.facility_id);
    return d;
  }
  assertCan(p, "case.view");
  return d;
}

/* ---------- Status laporan peserta mengikuti kasus ---------- */
/** Laporan layanan peserta (service_requests) yang tertaut ke kasus ikut berubah mengikuti kemajuan kasus, supaya peserta melihat status relevan. */
export function syncServiceRequests(db: Database.Database, caseId: string) {
  const reqs = db.prepare("SELECT id, status FROM service_requests WHERE case_id = ?").all(caseId) as { id: string; status: string }[];
  if (!reqs.length) return;
  const c = db.prepare("SELECT lifecycle FROM cases WHERE id = ?").get(caseId) as { lifecycle: string } | undefined;
  if (!c) return;
  const q = (sql: string) => (db.prepare(sql).get(caseId) as { n: number }).n > 0;
  let next: string;
  if (c.lifecycle === "closed") next = "closed";
  else if (q("SELECT COUNT(*) n FROM improvement_actions WHERE case_id = ? AND status IN ('open','in_progress','resolved','follow_up_pending')")) next = "action";
  else if (q("SELECT COUNT(*) n FROM improvement_actions WHERE case_id = ?")) next = "resolved";
  else if (q("SELECT COUNT(*) n FROM clarifications WHERE case_id = ? AND status = 'sent'")) next = "clarification";
  else if (q("SELECT COUNT(*) n FROM findings WHERE case_id = ? AND proof_status <> 'signal'")) next = "in_review";
  else next = "received";
  for (const r of reqs) if (r.status !== next) db.prepare("UPDATE service_requests SET status = ? WHERE id = ?").run(next, r.id);
}

/* ---------- Waktu: klarifikasi lewat tenggat ---------- */
/** Menandai klarifikasi yang lewat tenggat (paling sering sekali per menit). Lewat tenggat memenuhi hak jawab, tidak membuktikan apa pun. */
export function lapseIfDue(db: Database.Database, now: string = nowIso()) {
  const last = getMeta(db, "casework:last_lapse_check");
  const stamp = now.slice(0, 16);
  if (last === stamp) return 0;
  setMeta(db, "casework:last_lapse_check", stamp);
  const n = lapseOverdueClarifications(db, SYSTEM_ACTOR, now);
  if (n) for (const row of db.prepare("SELECT DISTINCT case_id FROM clarifications WHERE status = 'lapsed'").all() as { case_id: string }[]) syncServiceRequests(db, row.case_id);
  return n;
}
