import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { extractText, getDocumentProxy } from "unpdf";
import { appendAudit } from "../audit";
import { AuthError, assertCan, assertFacility, isInternal, type Principal } from "../auth/principal";
import type { Actor } from "../cases/core";
import { nowPrecise } from "../clock";
import { nextId } from "../db";
import { DomainError } from "../idem";
import { defaultOcr, type OcrAdapter } from "./ocr";
import { MAX_PAGES, validateUpload } from "./validate";

/* Dokumen bukti: unggah → validasi isi → ekstraksi teks (PDF berlapis teks: sungguhan; pindaian/gambar: OCR bila mesin ada, selain itu transkripsi manual)
   → peninjauan manusia. Hasil ekstraksi/OCR/transkripsi adalah USULAN sampai dikonfirmasi peninjau. Teks dokumen adalah DATA:
   tidak pernah dijalankan, tidak dipakai sebagai instruksi, dan ditampilkan sebagai teks biasa. */

export const MIN_TEXT_CHARS = 20;
export const MAX_TEXT_CHARS = 20_000;

export type DocKind = "pdf_text" | "pdf_scan" | "image" | "text" | "other";
export type DocStatus = "uploaded" | "text_extracted" | "needs_manual_transcription" | "ocr_unavailable" | "reviewed" | "failed";
export type ExtractionStatus = "proposed" | "confirmed" | "corrected" | "rejected";
export type ExtractionEngine = "pdf_text" | "ocr" | "manual" | "demo_fixture";

export interface DocumentRow {
  id: string; episode_id: string | null; facility_id: string; case_id: string | null; finding_id: string | null; clarification_id: string | null;
  name: string; mime: string; size: number; sha256: string; kind: DocKind; page_count: number | null; processing_status: DocStatus;
  uploaded_by: string; uploaded_role: string; created_at: string;
}
export interface ExtractionRow {
  id: string; document_id: string; page: number | null; engine: ExtractionEngine; text: string; simulated: number; status: ExtractionStatus;
  corrected_text: string | null; reviewer: string | null; reviewed_at: string | null; created_at: string; created_by: string | null;
}

const DOC_COLS = "id, episode_id, facility_id, case_id, finding_id, clarification_id, name, mime, size, sha256, kind, page_count, processing_status, uploaded_by, uploaded_role, created_at";
const A = (a: Actor) => ({ actor: a.id, actor_role: a.role });
const clean = (s: string) => s.replace(/\u0000/g, "").replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g, "");

export const STATUS_LABEL: Record<DocStatus, { label: string; tone: "muted" | "info" | "warn" | "ok" | "danger"; hint: string }> = {
  uploaded: { label: "Menunggu diproses", tone: "muted", hint: "Berkas tersimpan; ekstraksi teks belum berjalan." },
  text_extracted: { label: "Usulan teks menunggu tinjauan", tone: "info", hint: "Teks diekstrak mesin atau diketik petugas. Masih usulan sampai dikonfirmasi peninjau." },
  needs_manual_transcription: { label: "Perlu transkripsi manual", tone: "warn", hint: "Tidak ada teks yang dapat diekstrak. Petugas mengetik isinya di editor, lalu peninjau mengonfirmasi." },
  ocr_unavailable: { label: "Perlu transkripsi manual (OCR belum tersedia)", tone: "warn", hint: "Dokumen ini pindaian/gambar dan mesin OCR tidak terpasang. Jalur transkripsi manual tetap berfungsi." },
  reviewed: { label: "Sudah ditinjau", tone: "ok", hint: "Seluruh halaman yang diusulkan sudah diputuskan peninjau." },
  failed: { label: "Gagal diproses", tone: "danger", hint: "Berkas tidak dapat dibaca. Unggah ulang atau transkripsi manual." },
};
export const ENGINE_LABEL: Record<ExtractionEngine, string> = {
  pdf_text: "Ekstraksi teks PDF (sungguhan)",
  ocr: "OCR",
  manual: "Transkripsi manual",
  demo_fixture: "SIMULASI (fixture demo, bukan hasil baca dokumen)",
};

/* ---------- Akses ---------- */
export function assertDocAccess(p: Principal, facilityId: string) {
  if (isInternal(p)) return;
  if (p.role === "faskes") return assertFacility(p, facilityId);
  throw new AuthError("Peran ini tidak memiliki akses ke dokumen bukti.");
}

function mustDoc(db: Database.Database, id: string): DocumentRow {
  const d = db.prepare(`SELECT ${DOC_COLS} FROM documents WHERE id = ?`).get(id) as DocumentRow | undefined;
  if (!d) throw new DomainError("Dokumen tidak ditemukan.", 404);
  return d;
}

/* ---------- Unggah ---------- */
export interface UploadInput {
  name: string;
  mime: string;
  bytes: Uint8Array;
  episodeId?: string | null;
  caseId?: string | null;
  findingId?: string | null;
  clarificationId?: string | null;
  facilityId?: string | null;
}

/** Simpan dokumen (tanpa ekstraksi). Unggahan identik (hash sama pada faskes dan episode yang sama) tidak membuat dokumen ganda. */
export function uploadDocument(db: Database.Database, p: Principal, input: UploadInput): { id: string; created: boolean } {
  assertCan(p, "evidence.upload");
  const v = validateUpload({ name: input.name, mime: input.mime, bytes: input.bytes });
  if (!v.ok) throw new DomainError(v.message, 422);
  let facilityId = input.facilityId ?? null;
  if (input.episodeId) {
    const ep = db.prepare("SELECT facility_id FROM episodes WHERE id = ?").get(input.episodeId) as { facility_id: string } | undefined;
    if (!ep) throw new DomainError("Episode tidak ditemukan.", 404);
    if (facilityId && facilityId !== ep.facility_id) throw new DomainError("Faskes tidak sesuai dengan episode.", 422);
    facilityId = ep.facility_id;
  }
  if (p.role === "faskes") facilityId = facilityId ?? p.facilityId;
  if (!facilityId) throw new DomainError("Faskes pemilik dokumen belum ditentukan (pilih episode atau faskes).", 422);
  const fac = db.prepare("SELECT 1 FROM facilities WHERE id = ?").get(facilityId);
  if (!fac) throw new DomainError("Faskes tidak dikenal.", 422);
  assertDocAccess(p, facilityId);
  if (input.caseId) {
    const c = db.prepare("SELECT facility_id FROM cases WHERE id = ?").get(input.caseId) as { facility_id: string } | undefined;
    if (!c || c.facility_id !== facilityId) throw new DomainError("Kasus tidak ditemukan pada faskes ini.", 422);
  }
  const hash = createHash("sha256").update(input.bytes).digest("hex");
  return db.transaction(() => {
    const dup = db.prepare("SELECT id FROM documents WHERE sha256 = ? AND facility_id = ? AND COALESCE(episode_id,'') = ?").get(hash, facilityId, input.episodeId ?? "") as { id: string } | undefined;
    if (dup) return { id: dup.id, created: false };
    const id = nextId(db, "DOC");
    db.prepare(
      "INSERT INTO documents (id, episode_id, facility_id, case_id, finding_id, clarification_id, name, mime, size, sha256, content, kind, page_count, processing_status, uploaded_by, uploaded_role, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,'uploaded',?,?,?)",
    ).run(id, input.episodeId ?? null, facilityId, input.caseId ?? null, input.findingId ?? null, input.clarificationId ?? null, v.name, v.mime, input.bytes.length, hash, Buffer.from(input.bytes), v.kind === "pdf" ? "other" : "image", p.id, p.role, nowPrecise());
    appendAudit(db, { ...A(p), action: "dokumen_diunggah", entity: "document", entity_id: id, detail: { faskes: facilityId, episode: input.episodeId ?? null, tipe: v.type, ukuran: input.bytes.length, hash: hash.slice(0, 16) } });
    return { id, created: true };
  })();
}

/* ---------- Ekstraksi ---------- */
async function readPdf(bytes: Buffer): Promise<{ pages: string[] }> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  if (pdf.numPages > MAX_PAGES) throw new DomainError(`PDF terlalu panjang (${pdf.numPages} halaman; maksimal ${MAX_PAGES}).`, 422);
  const r = await extractText(pdf, { mergePages: false });
  return { pages: (r.text as unknown as string[]).map((t) => clean(t).trim()) };
}

function insertExtraction(db: Database.Database, e: { documentId: string; page: number | null; engine: ExtractionEngine; text: string; simulated?: boolean; createdBy: string }) {
  const id = nextId(db, "EX");
  db.prepare("INSERT INTO extractions (id, document_id, page, engine, text, simulated, status, created_at, created_by) VALUES (?,?,?,?,?,?, 'proposed', ?, ?)").run(
    id, e.documentId, e.page, e.engine, e.text.slice(0, MAX_TEXT_CHARS), e.simulated ? 1 : 0, nowPrecise(), e.createdBy,
  );
  return id;
}

/** Jalankan ekstraksi. PDF berlapis teks: pembacaan teks sungguhan. Pindaian/gambar: OCR bila mesin ada, selain itu status "perlu transkripsi manual". Idempoten. */
export async function processDocument(db: Database.Database, by: Actor, docId: string, ocr: OcrAdapter = defaultOcr()): Promise<DocStatus> {
  const doc = mustDoc(db, docId);
  if (doc.processing_status !== "uploaded") return doc.processing_status;
  const row = db.prepare("SELECT content FROM documents WHERE id = ?").get(docId) as { content: Buffer };
  const bytes = Buffer.from(row.content);
  const isPdf = doc.mime === "application/pdf";
  let plan: ProcessingPlan;
  try {
    if (isPdf) {
      const { pages } = await readPdf(bytes);
      const total = pages.reduce((a, t) => a + t.replace(/\s/g, "").length, 0);
      if (total >= MIN_TEXT_CHARS) {
        plan = { kind: "pdf_text", status: "text_extracted", pageCount: pages.length, extractions: pages.map((t, i) => ({ page: i + 1, engine: "pdf_text" as const, text: t })).filter((x) => x.text), note: "teks PDF" };
      } else {
        plan = await viaOcr(ocr, bytes, "pdf", pages.length, "pdf_scan");
      }
    } else {
      plan = await viaOcr(ocr, bytes, "image", 1, "image");
    }
  } catch (e) {
    const msg = e instanceof DomainError ? e.message : "Berkas tidak dapat dibaca.";
    db.transaction(() => {
      db.prepare("UPDATE documents SET processing_status = 'failed' WHERE id = ?").run(docId);
      appendAudit(db, { ...A(by), action: "dokumen_gagal_diproses", entity: "document", entity_id: docId, detail: { pesan: msg.slice(0, 100) } });
    })();
    return "failed";
  }
  commitProcessing(db, by, docId, plan);
  return plan.status;
}

/** Proses ulang dokumen yang sebelumnya "OCR belum tersedia" atau "gagal" (mis. setelah mesin OCR dipasang). Hanya bila belum ada usulan teks aktif. */
export async function reprocessDocument(db: Database.Database, by: Actor, docId: string, ocr: OcrAdapter = defaultOcr()): Promise<DocStatus> {
  const doc = mustDoc(db, docId);
  if (doc.processing_status === "uploaded") return processDocument(db, by, docId, ocr);
  if (doc.processing_status !== "ocr_unavailable" && doc.processing_status !== "failed") throw new DomainError("Dokumen ini sudah memiliki hasil pemrosesan; tidak perlu diproses ulang.", 409);
  const active = (db.prepare("SELECT COUNT(*) c FROM extractions WHERE document_id = ? AND status <> 'rejected'").get(docId) as { c: number }).c;
  if (active > 0) throw new DomainError("Dokumen sudah memiliki usulan teks.", 409);
  const changed = db.prepare("UPDATE documents SET processing_status = 'uploaded' WHERE id = ? AND processing_status = ?").run(docId, doc.processing_status).changes;
  if (changed) appendAudit(db, { ...A(by), action: "dokumen_diproses_ulang", entity: "document", entity_id: docId, detail: { dari: doc.processing_status } });
  return processDocument(db, by, docId, ocr);
}

export interface ProcessingPlan { kind: DocKind; status: DocStatus; pageCount: number | null; extractions: { page: number; engine: ExtractionEngine; text: string }[]; note: string }

/** Bagian penulisan hasil pemrosesan (sinkron). Dipakai juga oleh seed demo. */
export function commitProcessing(db: Database.Database, by: Actor, docId: string, plan: ProcessingPlan) {
  db.transaction(() => {
    const changed = db.prepare("UPDATE documents SET kind = ?, page_count = ?, processing_status = ? WHERE id = ? AND processing_status = 'uploaded'").run(plan.kind, plan.pageCount, plan.status, docId).changes;
    if (!changed) return; // sudah diproses oleh pemanggil lain (cegah usulan ganda)
    for (const x of plan.extractions) insertExtraction(db, { documentId: docId, page: x.page, engine: x.engine, text: x.text, createdBy: by.id });
    appendAudit(db, { ...A(by), action: "dokumen_diproses", entity: "document", entity_id: docId, detail: { jenis: plan.kind, status: plan.status, halaman: plan.pageCount, usulan: plan.extractions.length, cara: plan.note } });
  })();
}

async function viaOcr(ocr: OcrAdapter, bytes: Buffer, input: "image" | "pdf", pageCount: number, kind: DocKind) {
  if (!ocr.available(input)) {
    return { kind, status: "ocr_unavailable" as DocStatus, pageCount, extractions: [] as { page: number; engine: ExtractionEngine; text: string }[], note: `OCR tidak tersedia: ${ocr.reason(input)}` };
  }
  try {
    const r = await ocr.recognize(bytes, input);
    const usable = r.pages.map((p) => ({ page: p.page, engine: "ocr" as const, text: clean(p.text).trim() })).filter((p) => p.text.replace(/\s/g, "").length > 0);
    return { kind, status: (usable.length ? "text_extracted" : "needs_manual_transcription") as DocStatus, pageCount: input === "pdf" ? pageCount : 1, extractions: usable, note: `OCR ${r.engine}` };
  } catch {
    return { kind, status: "needs_manual_transcription" as DocStatus, pageCount, extractions: [], note: "OCR dicoba tetapi gagal" };
  }
}

/** Hanya seed demo: fixture berlabel SIMULASI untuk dokumen demo yang dikenal. Bukan jalur untuk dokumen sembarang. */
export function addDemoFixtureExtraction(db: Database.Database, by: Actor, docId: string, page: number, text: string) {
  const d = mustDoc(db, docId);
  db.transaction(() => {
    insertExtraction(db, { documentId: docId, page, engine: "demo_fixture", text, simulated: true, createdBy: by.id });
    db.prepare("UPDATE documents SET processing_status = 'text_extracted', page_count = COALESCE(page_count, 1) WHERE id = ?").run(docId);
    appendAudit(db, { ...A(by), action: "fixture_demo_ditambahkan", entity: "document", entity_id: d.id, detail: { halaman: page, label: "SIMULASI" } });
  })();
}

/* ---------- Transkripsi manual dan peninjauan ---------- */
export function transcribeDocument(db: Database.Database, p: Principal, docId: string, pages: { page: number; text: string }[]) {
  assertCan(p, "evidence.review");
  if (!pages.length) throw new DomainError("Isi transkripsi minimal satu halaman.", 422);
  return db.transaction(() => {
    const d = mustDoc(db, docId);
    assertDocAccess(p, d.facility_id);
    if (d.processing_status === "uploaded") throw new DomainError("Dokumen belum diproses. Jalankan ekstraksi dulu.", 409);
    const active = (db.prepare("SELECT COUNT(*) c FROM extractions WHERE document_id = ? AND status <> 'rejected'").get(docId) as { c: number }).c;
    if (active > 0) throw new DomainError("Dokumen sudah memiliki usulan teks. Koreksi usulan yang ada, atau tolak dulu bila salah.", 409);
    const seen = new Set<number>();
    const ids: string[] = [];
    for (const x of pages) {
      const text = clean(x.text).trim();
      if (!Number.isInteger(x.page) || x.page < 1 || x.page > (d.page_count ?? MAX_PAGES)) throw new DomainError(`Nomor halaman ${x.page} di luar jangkauan dokumen.`, 422);
      if (seen.has(x.page)) throw new DomainError(`Halaman ${x.page} diisi dua kali.`, 422);
      seen.add(x.page);
      if (text.length < 3) throw new DomainError(`Teks halaman ${x.page} terlalu singkat.`, 422);
      if (text.length > MAX_TEXT_CHARS) throw new DomainError(`Teks halaman ${x.page} terlalu panjang (maks. ${MAX_TEXT_CHARS} karakter).`, 422);
      ids.push(insertExtraction(db, { documentId: docId, page: x.page, engine: "manual", text, createdBy: p.id }));
    }
    db.prepare("UPDATE documents SET processing_status = 'text_extracted' WHERE id = ?").run(docId);
    appendAudit(db, { ...A(p), action: "transkripsi_manual_disimpan", entity: "document", entity_id: docId, detail: { halaman: pages.length } });
    return ids;
  })();
}

export function reviewExtraction(db: Database.Database, p: Principal, extractionId: string, input: { action: "confirm" | "correct" | "reject"; correctedText?: string }) {
  assertCan(p, "evidence.review");
  return db.transaction(() => {
    const e = db.prepare("SELECT * FROM extractions WHERE id = ?").get(extractionId) as ExtractionRow | undefined;
    if (!e) throw new DomainError("Usulan teks tidak ditemukan.", 404);
    const d = mustDoc(db, e.document_id);
    assertDocAccess(p, d.facility_id);
    if (e.status !== "proposed") throw new DomainError("Usulan ini sudah diputuskan.", 409);
    if (e.engine === "manual" && e.created_by === p.id) throw new DomainError("Transkripsi manual harus dikonfirmasi orang lain, bukan pengetiknya.", 403);
    let next: ExtractionStatus;
    let corrected: string | null = null;
    if (input.action === "confirm") next = "confirmed";
    else if (input.action === "reject") next = "rejected";
    else {
      corrected = clean(input.correctedText ?? "").trim();
      if (corrected.length < 3) throw new DomainError("Teks koreksi wajib diisi.", 422);
      if (corrected.length > MAX_TEXT_CHARS) throw new DomainError(`Teks koreksi terlalu panjang (maks. ${MAX_TEXT_CHARS} karakter).`, 422);
      if (corrected === e.text.trim()) throw new DomainError("Teks koreksi sama dengan usulan; gunakan 'Konfirmasi'.", 422);
      next = "corrected";
    }
    db.prepare("UPDATE extractions SET status = ?, corrected_text = ?, reviewer = ?, reviewed_at = ? WHERE id = ?").run(next, corrected, p.id, nowPrecise(), extractionId);
    const left = (db.prepare("SELECT COUNT(*) c FROM extractions WHERE document_id = ? AND status = 'proposed'").get(d.id) as { c: number }).c;
    const accepted = (db.prepare("SELECT COUNT(*) c FROM extractions WHERE document_id = ? AND status IN ('confirmed','corrected')").get(d.id) as { c: number }).c;
    const active = (db.prepare("SELECT COUNT(*) c FROM extractions WHERE document_id = ? AND status <> 'rejected'").get(d.id) as { c: number }).c;
    const status: DocStatus = left === 0 && accepted > 0 ? "reviewed" : active === 0 ? "needs_manual_transcription" : "text_extracted";
    db.prepare("UPDATE documents SET processing_status = ? WHERE id = ?").run(status, d.id);
    appendAudit(db, { ...A(p), action: `usulan_teks_${next}`, entity: "extraction", entity_id: extractionId, detail: { dokumen: d.id, halaman: e.page, mesin: e.engine } });
    return { status: next, documentStatus: status };
  })();
}

/* ---------- Baca ---------- */
export function listDocuments(db: Database.Database, p: Principal, filter: { episodeId?: string; facilityId?: string; status?: DocStatus; q?: string } = {}) {
  if (!isInternal(p) && p.role !== "faskes") throw new AuthError("Peran ini tidak memiliki akses ke dokumen bukti.");
  const where: string[] = [];
  const args: unknown[] = [];
  if (p.role === "faskes") { where.push("facility_id = ?"); args.push(p.facilityId); }
  else if (filter.facilityId) { where.push("facility_id = ?"); args.push(filter.facilityId); }
  if (filter.episodeId) { where.push("episode_id = ?"); args.push(filter.episodeId); }
  if (filter.status) { where.push("processing_status = ?"); args.push(filter.status); }
  if (filter.q) { where.push("name LIKE ?"); args.push(`%${filter.q.replace(/[%_]/g, "")}%`); }
  const rows = db.prepare(`SELECT ${DOC_COLS}, (SELECT COUNT(*) FROM extractions e WHERE e.document_id = documents.id AND e.status = 'proposed') AS proposed FROM documents ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC, id DESC LIMIT 200`).all(...args) as (DocumentRow & { proposed: number })[];
  return rows;
}

export function getDocument(db: Database.Database, p: Principal, id: string) {
  const d = mustDoc(db, id);
  assertDocAccess(p, d.facility_id);
  const ex = db.prepare("SELECT * FROM extractions WHERE document_id = ? ORDER BY COALESCE(page, 0), created_at, id").all(id) as ExtractionRow[];
  return { document: d, extractions: ex };
}

/** Berkas untuk diunduh (terotorisasi, dicatat di audit). Pemanggil wajib mengirim sebagai lampiran dengan nosniff. */
export function readDocumentBytes(db: Database.Database, p: Principal, id: string) {
  const d = mustDoc(db, id);
  assertDocAccess(p, d.facility_id);
  const r = db.prepare("SELECT content FROM documents WHERE id = ?").get(id) as { content: Buffer };
  appendAudit(db, { ...A(p), action: "dokumen_dibuka", entity: "document", entity_id: id, detail: {} });
  return { name: d.name, mime: d.mime, bytes: Buffer.from(r.content) };
}

/** Rujukan sumber untuk tautan bukti (modul kasus): dokumen, halaman, mesin, status, dan teks efektif (koreksi bila ada). */
export function provenanceOf(db: Database.Database, extractionId: string) {
  const e = db.prepare("SELECT * FROM extractions WHERE id = ?").get(extractionId) as ExtractionRow | undefined;
  if (!e) return null;
  const d = mustDoc(db, e.document_id);
  return { extractionId: e.id, documentId: d.id, documentName: d.name, sha256: d.sha256, page: e.page, engine: e.engine, simulated: !!e.simulated, status: e.status, text: e.corrected_text ?? e.text, confirmed: e.status === "confirmed" || e.status === "corrected" };
}
